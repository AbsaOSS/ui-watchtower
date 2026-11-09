// The lab's mock backend. It stands in for everything the library talks to,
// so the real aws-rum-web runs fully offline:
//
//   GET  /rum/init              mock RUM broker: app monitor config and fake
//                               credentials; its mode decides the answer
//   POST /appmonitors/:id       mock RUM dataplane: keeps every PutRumEvents
//                               batch, beacons included
//   POST /api/logs              mock log backend: stores records
//   GET  /api/logs?…            answers the log provider's query()
//   GET  /api/data?delay&status a slow or failing endpoint, for HTTP scenarios
//   GET  /__lab/rum, /__lab/logs, /__lab/state
//   GET, POST /__lab/custom     what the lab's custom sink was given
//   POST /__lab/reset, /__lab/broker-mode, /__lab/telemetries,
//        /__lab/broker-config                                   test hooks
import { Request, Router } from 'express';
import { promised } from './promised';
import { gunzipSync } from 'node:zlib';

const BROKER_MODES = [
  'ok',
  'null',
  'fail',
  'short-expiry',
  'flaky',
  'invalid',
  'null-on-refresh',
  'no-credentials-on-refresh'
];
const TELEMETRIES = ['errors', 'performance', 'interaction', 'http', 'replay'];
const LEVELS: Record<string, number> = { log: 0, warn: 1, error: 2 };

interface LogRecord {
  level: string;
  logger?: string;
  correlationId?: string;
  timestamp?: string;
}

interface ReceivedEvent {
  id: string;
  receivedAt: string;
  batch: number;
  user: Record<string, unknown>;
  type: string;
  metadata: unknown;
  details: unknown;
}

// `telemetries: null` leaves them out of the broker's answer: the library's
// default applies. `brokerConfig` is laid over the answer's config, and
// `brokerCalls` counts `/rum/init` calls since the mode was set.
const state: {
  brokerMode: string;
  brokerCalls: number;
  brokerConfig: Record<string, unknown>;
  telemetries: string[] | null;
  batches: number;
  rum: ReceivedEvent[];
  logs: LogRecord[];
  custom: unknown[];
} = {
  brokerMode: 'ok',
  brokerCalls: 0,
  brokerConfig: {},
  telemetries: null,
  batches: 0,
  rum: [],
  logs: [],
  custom: []
};

/**
 * The body as text, gunzipped if RUM compressed it. A page that closes while
 * sending leaves it empty or cut short; either way it is `''`, which nothing
 * keeps.
 */
function readBody(req: Request): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const gzip =
        req.headers['content-encoding'] === 'gzip' ||
        (raw[0] === 0x1f && raw[1] === 0x8b);
      // Thrown here, outside the promise, an error would stop the server.
      try {
        resolve((gzip ? gunzipSync(raw) : raw).toString('utf8'));
      } catch {
        resolve('');
      }
    });
    req.on('error', () => resolve(''));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(text: string | undefined): any {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return undefined;
  }
}

/**
 * What the broker answers, by mode and the page's call — its first, at
 * startup, or a later one, a retry or refresh: `undefined` for an error,
 * `enabled: false` to turn RUM off for the page.
 *
 * - `flaky`: the first two calls fail, as a broker starting up might
 * - `invalid`: `pagesToExclude` as strings, which JSON makes of patterns
 * - `null-on-refresh`, `no-credentials-on-refresh`: short-lived credentials,
 *   then a refresh answered with `null`, or without credentials
 */
function broker(req: Request) {
  const mode = state.brokerMode;
  state.brokerCalls++;
  // The page counts its own calls: each load starts again at 1.
  const call = Number(req.query.call) || 1;
  if (mode === 'fail' || (mode === 'flaky' && call <= 2)) {
    return undefined;
  }
  const refreshing = call > 1;
  if (mode === 'null' || (mode === 'null-on-refresh' && refreshing)) {
    return { enabled: false };
  }
  const shortLived = [
    'short-expiry',
    'null-on-refresh',
    'no-credentials-on-refresh'
  ].includes(mode);
  const origin = `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
  const minutes = shortLived ? 5 + 5 / 60 : 60;
  return {
    enabled: true,
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
      // The lab is plain http on localhost, where WebKit keeps none of the
      // RUM client's cookies as it writes them by default, and with them go
      // the session and its start: no Secure cookie over http, and on Linux
      // no Domain=localhost, as it has no dot; an empty Domain is host-only.
      // Lax, as WebKit on Linux may hide a Strict cookie from a page opened
      // from about:blank, as Playwright opens them.
      cookieAttributes: { secure: false, domain: '', sameSite: 'Lax' },
      // Names only: the lab's credentials provider adds their options.
      ...(state.telemetries ? { telemetries: state.telemetries } : {}),
      ...(mode === 'invalid' ? { pagesToExclude: ['^/private'] } : {}),
      ...state.brokerConfig
    },
    // Never used to sign — signing is off — but the sink schedules its
    // refresh from their expiry, which the short-lived modes rely on.
    ...(mode === 'no-credentials-on-refresh' && refreshing
      ? {}
      : {
          credentials: {
            accessKeyId: 'LAB-FAKE-KEY',
            secretAccessKey: 'lab-fake-secret',
            sessionToken: 'lab-fake-token',
            expiration: new Date(Date.now() + minutes * 60_000).toISOString()
          }
        })
  };
}

function keepBatch(body: string): void {
  const batch = parseJson(body);
  if (!batch) {
    return;
  }
  state.batches++;
  for (const event of batch.RumEvents ?? []) {
    state.rum.push({
      id: event.id,
      receivedAt: new Date().toISOString(),
      batch: state.batches,
      user: batch.UserDetails ?? {},
      type: event.type,
      metadata: parseJson(event.metadata) ?? {},
      details: parseJson(event.details) ?? {}
    });
  }
}

function queryLogs(query: Request['query']): LogRecord[] {
  const param = (name: string) =>
    typeof query[name] === 'string' ? query[name] : undefined;
  const minLevel = param('minLevel');
  const limit = Number(param('limit')) || Infinity;
  return state.logs
    .filter(
      (r) =>
        (!param('logger') || r.logger === param('logger')) &&
        (!param('correlationId') ||
          r.correlationId === param('correlationId')) &&
        (!minLevel || LEVELS[r.level] >= LEVELS[minLevel]) &&
        (!param('from') || (r.timestamp ?? '') >= param('from')!) &&
        (!param('to') || (r.timestamp ?? '') <= param('to')!)
    )
    .slice(-limit);
}

export const labBackend = Router();

// Only the lab's own pages, and the suite, which sends no Origin, change its
// state: another site's page could otherwise point RUM at its own endpoint.
labBackend.use('/__lab', (req, res, next) => {
  const origin = req.get('origin');
  if (
    req.method === 'POST' &&
    origin &&
    new URL(origin).host !== req.get('host')
  ) {
    res.status(403).end();
    return;
  }
  next();
});

labBackend.get('/rum/init', (req, res) => {
  // Lab-only: what the broker was set to, for the header to show what this
  // page load got. A real broker sends nothing like it.
  const lab = { mode: state.brokerMode, telemetries: state.telemetries };
  const answer = broker(req);
  if (answer) {
    res.json({ ...answer, lab });
  } else {
    res.status(500).json({
      error: `broker unavailable (lab mode: ${state.brokerMode})`,
      lab
    });
  }
});

labBackend.post(
  '/appmonitors/:id',
  promised(async (req, res) => {
    keepBatch(await readBody(req));
    res.json({});
  })
);

labBackend
  .route('/api/logs')
  .post(
    promised(async (req, res) => {
      const body = parseJson(await readBody(req));
      state.logs.push(...(Array.isArray(body) ? body : [body]).filter(Boolean));
      res.status(204).end();
    })
  )
  .get((req, res) => {
    res.json(queryLogs(req.query));
  });

labBackend.get(
  '/api/data',
  promised(async (req, res) => {
    const delay = Math.min(Number(req.query.delay) || 0, 30_000);
    const status = Number(req.query.status) || 200;
    await new Promise((resolve) => setTimeout(resolve, delay));
    res.status(status).json({ status, delay, at: new Date().toISOString() });
  })
);

labBackend.get('/__lab/rum', (_req, res) => {
  res.json({ batches: state.batches, events: state.rum });
});

labBackend.get('/__lab/logs', (_req, res) => {
  res.json(state.logs);
});

labBackend.get('/__lab/state', (_req, res) => {
  res.json({
    brokerMode: state.brokerMode,
    brokerCalls: state.brokerCalls,
    brokerConfig: state.brokerConfig,
    modes: BROKER_MODES,
    telemetries: state.telemetries
  });
});

labBackend.post('/__lab/reset', (_req, res) => {
  Object.assign(state, { batches: 0, rum: [], logs: [], custom: [] });
  res.status(204).end();
});

labBackend.post(
  '/__lab/broker-mode',
  promised(async (req, res) => {
    const mode = parseJson(await readBody(req))?.mode;
    if (!BROKER_MODES.includes(mode)) {
      res
        .status(400)
        .json({ error: `mode must be one of ${BROKER_MODES.join(', ')}` });
      return;
    }
    Object.assign(state, { brokerMode: mode, brokerCalls: 0 });
    res.json({ brokerMode: mode });
  })
);

labBackend.post(
  '/__lab/telemetries',
  promised(async (req, res) => {
    const telemetries = parseJson(await readBody(req))?.telemetries;
    const valid =
      telemetries === null ||
      (Array.isArray(telemetries) &&
        telemetries.every((t) => TELEMETRIES.includes(t)));
    if (!valid) {
      res.status(400).json({
        error: `telemetries must be null or some of ${TELEMETRIES.join(', ')}`
      });
      return;
    }
    state.telemetries = telemetries;
    res.json({ telemetries });
  })
);

labBackend.post(
  '/__lab/broker-config',
  promised(async (req, res) => {
    const config = parseJson(await readBody(req))?.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      res.status(400).json({ error: 'config must be an object' });
      return;
    }
    state.brokerConfig = config;
    res.json({ config });
  })
);

labBackend
  .route('/__lab/custom')
  .post(
    promised(async (req, res) => {
      const body = parseJson(await readBody(req));
      state.custom.push(
        ...(Array.isArray(body) ? body : [body]).filter(Boolean)
      );
      res.status(204).end();
    })
  )
  .get((_req, res) => {
    res.json(state.custom);
  });
