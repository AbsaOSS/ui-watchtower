// The Watchtower Lab's mock backend, with no dependencies. It stands in for
// everything the library talks to, so the real aws-rum-web runs fully
// offline:
//
//   GET  /rum/init              mock RUM broker: app monitor config and fake
//                               credentials; its mode decides the answer
//   POST /appmonitors/:id       mock RUM dataplane: keeps every PutRumEvents
//                               batch, beacons included
//   POST /api/logs              mock log backend: stores records
//   GET  /api/logs?…            answers the log provider's query()
//   GET  /api/data?delay&status a slow or failing endpoint, for HTTP scenarios
//   GET  /__lab/rum, /__lab/logs, /__lab/state
//   POST /__lab/reset, /__lab/broker-mode, /__lab/telemetries    test hooks
//
// `npm run lab` runs this and `ng serve watchtower-lab`, which proxies these
// paths here, so the app and this server share an origin. Pass
// `--server-only` to start just this server, or `--static` to serve the
// built lab (`npm run lab:build`) from here too, as the Playwright suite does.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const STATIC = process.argv.includes('--static');
// Its own port when static, so the suite can run beside `npm run lab`.
const PORT = STATIC ? 4390 : 4380;
const STATIC_DIR = fileURLToPath(
  new URL('../../../dist/watchtower-lab/browser/', import.meta.url)
);
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};
const BROKER_MODES = ['ok', 'null', 'fail', 'short-expiry'];
const TELEMETRIES = ['errors', 'performance', 'interaction', 'http', 'replay'];
const LEVELS = { log: 0, warn: 1, error: 2 };

// `telemetries: null` leaves them out of the broker's answer: the library's
// default applies.
const state = {
  brokerMode: 'ok',
  telemetries: null,
  batches: 0,
  rum: [],
  logs: []
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const gzip =
        req.headers['content-encoding'] === 'gzip' ||
        (raw[0] === 0x1f && raw[1] === 0x8b);
      resolve((gzip ? gunzipSync(raw) : raw).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

/** A file of the built lab, or its index.html for the app's own routes. */
async function serveStatic(res, path) {
  const file = join(STATIC_DIR, normalize(path));
  if (!extname(file)) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(await readFile(join(STATIC_DIR, 'index.html')));
  }
  if (!file.startsWith(STATIC_DIR) || !existsSync(file)) {
    return send(res, 404, { error: `no file ${path}` });
  }
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream'
  });
  return res.end(await readFile(file));
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** What the broker answers, by mode. `null` disables RUM for the page. */
function broker(req) {
  const origin = `http://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  const minutes = state.brokerMode === 'short-expiry' ? 5 + 5 / 60 : 60;
  return {
    enabled: state.brokerMode !== 'null',
    config: {
      applicationId: '00000000-0000-4000-8000-00000000a1ab',
      applicationVersion: '1.0.0',
      region: 'eu-west-1',
      endpoint: origin,
      signing: false,
      compressionStrategy: { enabled: false },
      sessionSampleRate: 1,
      // RUM stops recording a session after 200 events by default, and the
      // session outlives reloads in a cookie: one burst from the Event
      // Inspector page would silence the lab for half an hour.
      sessionEventLimit: 0,
      dispatchInterval: 2000,
      allowCookies: true,
      // Names only: the lab's credentials provider adds their options.
      ...(state.telemetries ? { telemetries: state.telemetries } : {})
    },
    // Never used to sign — signing is off — but the sink schedules its
    // refresh from their expiry, which short-expiry relies on.
    credentials: {
      accessKeyId: 'LAB-FAKE-KEY',
      secretAccessKey: 'lab-fake-secret',
      sessionToken: 'lab-fake-token',
      expiration: new Date(Date.now() + minutes * 60_000).toISOString()
    }
  };
}

function keepBatch(body) {
  const batch = parseJson(body);
  if (!batch) {
    return;
  }
  state.batches++;
  for (const event of batch.RumEvents ?? []) {
    state.rum.push({
      receivedAt: new Date().toISOString(),
      batch: state.batches,
      user: batch.UserDetails ?? {},
      type: event.type,
      metadata: parseJson(event.metadata) ?? {},
      details: parseJson(event.details) ?? {}
    });
  }
}

function queryLogs(params) {
  const minLevel = params.get('minLevel');
  const limit = Number(params.get('limit')) || Infinity;
  return state.logs
    .filter(
      (r) =>
        (!params.get('logger') || r.logger === params.get('logger')) &&
        (!params.get('correlationId') ||
          r.correlationId === params.get('correlationId')) &&
        (!minLevel || LEVELS[r.level] >= LEVELS[minLevel]) &&
        (!params.get('from') || r.timestamp >= params.get('from')) &&
        (!params.get('to') || r.timestamp <= params.get('to'))
    )
    .slice(-limit);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://lab');
  const path = url.pathname;
  try {
    if (req.method === 'GET' && path === '/rum/init') {
      return state.brokerMode === 'fail'
        ? send(res, 500, { error: 'broker unavailable (lab mode: fail)' })
        : send(res, 200, broker(req));
    }
    if (req.method === 'POST' && path.startsWith('/appmonitors/')) {
      keepBatch(await readBody(req));
      return send(res, 200, {});
    }
    if (path === '/api/logs') {
      if (req.method === 'POST') {
        const body = parseJson(await readBody(req));
        state.logs.push(
          ...(Array.isArray(body) ? body : [body]).filter(Boolean)
        );
        return send(res, 204);
      }
      return send(res, 200, queryLogs(url.searchParams));
    }
    if (path === '/api/data') {
      const delay = Math.min(
        Number(url.searchParams.get('delay')) || 0,
        30_000
      );
      const status = Number(url.searchParams.get('status')) || 200;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return send(res, status, { status, delay, at: new Date().toISOString() });
    }
    if (path === '/__lab/rum') {
      return send(res, 200, { batches: state.batches, events: state.rum });
    }
    if (path === '/__lab/logs') {
      return send(res, 200, state.logs);
    }
    if (path === '/__lab/state') {
      return send(res, 200, {
        brokerMode: state.brokerMode,
        modes: BROKER_MODES,
        telemetries: state.telemetries
      });
    }
    if (req.method === 'POST' && path === '/__lab/reset') {
      Object.assign(state, { batches: 0, rum: [], logs: [] });
      return send(res, 204);
    }
    if (req.method === 'POST' && path === '/__lab/broker-mode') {
      const mode = parseJson(await readBody(req))?.mode;
      if (!BROKER_MODES.includes(mode)) {
        return send(res, 400, {
          error: `mode must be one of ${BROKER_MODES.join(', ')}`
        });
      }
      state.brokerMode = mode;
      return send(res, 200, { brokerMode: mode });
    }
    if (req.method === 'POST' && path === '/__lab/telemetries') {
      const telemetries = parseJson(await readBody(req))?.telemetries;
      const valid =
        telemetries === null ||
        (Array.isArray(telemetries) &&
          telemetries.every((t) => TELEMETRIES.includes(t)));
      if (!valid) {
        return send(res, 400, {
          error: `telemetries must be null or some of ${TELEMETRIES.join(', ')}`
        });
      }
      state.telemetries = telemetries;
      return send(res, 200, { telemetries });
    }
    if (STATIC && req.method === 'GET') {
      return serveStatic(res, path);
    }
    return send(res, 404, { error: `no lab route for ${req.method} ${path}` });
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
});

if (STATIC && !existsSync(join(STATIC_DIR, 'index.html'))) {
  console.error('[watchtower-lab] no built lab: run `npm run lab:build` first');
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(
    STATIC
      ? `[watchtower-lab] built lab and mock backend on http://localhost:${PORT}`
      : `[watchtower-lab] mock backend on http://localhost:${PORT}`
  );
});

if (!STATIC && !process.argv.includes('--server-only')) {
  const ng = spawn('npx', ['ng', 'serve', 'watchtower-lab'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  const stop = () => {
    ng.kill();
    server.close();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  ng.on('exit', (code) => {
    server.close();
    process.exitCode = code ?? 0;
  });
}
