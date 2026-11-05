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
//   POST /__lab/reset, /__lab/broker-mode, /__lab/telemetries    test hooks
import { Request, Router } from 'express';
import { promised } from './promised';
import { gunzipSync } from 'node:zlib';

const BROKER_MODES = ['ok', 'null', 'fail', 'short-expiry'];
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
// default applies.
const state: {
  brokerMode: string;
  telemetries: string[] | null;
  batches: number;
  rum: ReceivedEvent[];
  logs: LogRecord[];
} = { brokerMode: 'ok', telemetries: null, batches: 0, rum: [], logs: [] };

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

/** What the broker answers, by mode. `null` disables RUM for the page. */
function broker(req: Request) {
  const origin = `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`;
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

labBackend.get('/rum/init', (req, res) => {
  if (state.brokerMode === 'fail') {
    res.status(500).json({ error: 'broker unavailable (lab mode: fail)' });
  } else {
    res.json(broker(req));
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
    modes: BROKER_MODES,
    telemetries: state.telemetries
  });
});

labBackend.post('/__lab/reset', (_req, res) => {
  Object.assign(state, { batches: 0, rum: [], logs: [] });
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
    state.brokerMode = mode;
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
