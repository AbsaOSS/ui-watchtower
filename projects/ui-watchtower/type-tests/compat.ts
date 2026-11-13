/**
 * The core's public API used the way a framework-free application, or an
 * integration, uses it. Compiled by `npm run typecheck` with plain `tsc`,
 * never run: no framework is involved anywhere. No registry is augmented
 * here, so every name is a plain string; see `augmented.ts` for registered
 * names.
 */
import { firstValueFrom, Observable, of } from 'rxjs';
import {
  UwtRumAppMonitorConfig,
  UwtRumBootstrap,
  UwtRumCredentials,
  UwtRumCredentialsProvider,
  UwtRumDocument,
  UwtRumTelemetrySink,
  UwtRumTelemetrySinkOptions
} from '@absaoss-cps/ui-watchtower/rum';
import {
  traceScenario,
  UwtTraceScenarioOptions
} from '@absaoss-cps/ui-watchtower/rxjs';
import {
  UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS,
  UWT_DEFAULT_BROADCAST_CHANNEL,
  UwtBroadcastConnection,
  UwtBroadcastConnectOptions,
  UwtBroadcastLogApiProvider,
  UwtBroadcastLogApiProviderOptions,
  UwtBroadcastMessage,
  UwtBroadcastTelemetrySink,
  UwtBroadcastTelemetrySinkOptions,
  uwtConnectBroadcastChannel,
  UwtTelemetryBroadcastHost,
  UwtTelemetryBroadcastHostOptions,
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_LOG_LEVEL_ORDER,
  UWT_REDACTED,
  UWT_TELEMETRY_EVENT_TYPE,
  UwtBITelemetry,
  UwtBITelemetryConfig,
  UwtBITelemetryOptions,
  uwtClassifyTelemetryEvent,
  uwtCreateTelemetry,
  UwtDebugFlag,
  uwtEventTypes,
  uwtIsDebugEnabled,
  UwtLogApiProvider,
  UwtLogConfig,
  UwtLogLevel,
  UwtLogQuery,
  UwtLogRecord,
  UwtLogTelemetry,
  UwtLogTelemetryOptions,
  uwtMarkSessionStart,
  uwtNormalizeError,
  UwtNoopLogApiProvider,
  UwtNoopTelemetrySink,
  UwtPiiValuePattern,
  UwtRedactConfig,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  UwtReporter,
  uwtConsoleReporter,
  uwtReport,
  UwtReportLevel,
  uwtSessionElapsed,
  uwtResolveTelemetryConfig,
  uwtSafe,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync,
  UwtScenario,
  UwtScenarioRecord,
  UwtScenarioTelemetry,
  UwtScenarioTelemetryConfig,
  UwtScenarioTelemetryOptions,
  uwtScrubString,
  UwtTelemetry,
  UwtTelemetryConfig,
  UwtTelemetryConfigOverrides,
  UwtTelemetryDocument,
  UwtTelemetryError,
  UwtTelemetryIdentity,
  UwtTelemetryMetadata,
  UwtTelemetryOptions,
  UwtTelemetrySink,
  UwtTelemetrySinkEvent,
  uwtUuid
} from '@absaoss-cps/ui-watchtower';

/** A destination the application writes itself. */
export class AppSink extends UwtTelemetrySink {
  readonly sent: UwtTelemetrySinkEvent[] = [];

  record(type: string, payload: object, _meta?: UwtTelemetryMetadata): void {
    this.sent.push(uwtClassifyTelemetryEvent(type, payload));
  }

  recordError(_error: UwtTelemetryError, _meta?: UwtTelemetryMetadata): void {
    // Sent elsewhere.
  }

  getSessionId(): string | undefined {
    return undefined;
  }

  setUserId(_userId: string | undefined): void {
    // Kept elsewhere.
  }

  getUserId(): string | undefined {
    return undefined;
  }

  flush(_beacon?: boolean): void {
    // Nothing buffered.
  }
}

/** A log backend. */
export class AppLogBackend implements UwtLogApiProvider {
  readonly ranks: number[] = [];

  send(record: UwtLogRecord): void {
    const level: UwtLogLevel = record.level;
    this.ranks.push(UWT_LOG_LEVEL_ORDER[level]);
  }

  query(_filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    return Promise.resolve([]);
  }
}

/** Where the application wants to see what telemetry handles silently. */
export const report: UwtReporter = (level, message, ...details) =>
  console[level === 'error' ? 'error' : 'warn'](`[app] ${message}`, ...details);

export const identity: UwtTelemetryIdentity = {
  application: 'app',
  environment: 'prod',
  version: '1.0.0',
  eventNamespace: UWT_DEFAULT_EVENT_NAMESPACE
};

export const configs: [
  UwtScenarioTelemetryConfig,
  UwtLogConfig,
  UwtBITelemetryConfig,
  UwtRedactConfig
] = [
  UWT_DEFAULT_TELEMETRY_CONFIG.scenario,
  UWT_DEFAULT_TELEMETRY_CONFIG.logs,
  UWT_DEFAULT_TELEMETRY_CONFIG.bi,
  UWT_DEFAULT_REDACT_CONFIG
];

/** A scenario, as an application handles one. */
export function journey(scenario: UwtScenario): UwtScenarioRecord {
  scenario.step('fetch', { rows: 1 }).endStep();
  scenario.complete({ statusCode: 200 });
  return scenario.toRecord();
}

/** The utilities an application or a destination calls. */
export function utilities(): unknown[] {
  const flag: UwtDebugFlag = 'debugScenario';
  const redact = uwtRedactConfigFor(UWT_DEFAULT_REDACT_CONFIG, true);
  const patterns: UwtPiiValuePattern[] = redact.scanValuePatterns;
  uwtMarkSessionStart(uwtUuid());
  return [
    uwtEventTypes(identity.eventNamespace),
    UWT_TELEMETRY_EVENT_TYPE.scenario,
    uwtIsDebugEnabled(flag),
    uwtScrubString('a@b.c', redact, report),
    uwtRedactMetadata({ email: 'a@b.c' }, redact, report),
    uwtNormalizeError(new Error('x'), redact, report),
    patterns,
    UWT_REDACTED
  ];
}

/** The engine, as a framework-free application creates and uses it. */
export async function engine(
  page: UwtTelemetryDocument | null
): Promise<number> {
  const overrides: UwtTelemetryConfigOverrides = {
    logging: { minLevel: 'warn' },
    redaction: { scanValuePatterns: ['email'] }
  };
  const options: UwtTelemetryOptions = {
    identity,
    destination: new UwtNoopTelemetrySink(),
    logApi: new UwtNoopLogApiProvider(),
    document: page,
    runOutside: (callback) => callback(),
    report,
    ...overrides
  };
  const telemetry: UwtTelemetry = uwtCreateTelemetry(options);
  const config: UwtTelemetryConfig = uwtResolveTelemetryConfig(overrides);

  const scenario: UwtScenario = telemetry.scenarios.start({ name: 'checkout' });
  const stop = telemetry.scenarios.onSettled((record: UwtScenarioRecord) =>
    report('warn', record.scenarioName)
  );
  const traced: UwtTraceScenarioOptions<number> = {
    outcome: (count) => ({ metadata: { count } })
  };
  const piped: Observable<number> = of(1).pipe(
    traceScenario(scenario, traced, report)
  );
  await firstValueFrom(piped);
  telemetry.bi.track(
    'export_clicked',
    { format: 'csv' },
    { scenarioId: scenario.id }
  );
  telemetry.logging.getLogger('checkout').warn('careful');
  const lines: UwtLogRecord[] = await telemetry.logging.query({ limit: 1 });
  telemetry.setUserId('user-1');
  telemetry.flush(true);
  stop();
  telemetry.dispose();
  uwtSafeVoid('app.cleanup', () => undefined, report);
  uwtSafeVoidMaybeAsync('app.async', async () => undefined, report);
  return uwtSafe(
    'app.count',
    () => lines.length + config.bi.dedupWindowMs,
    0,
    report
  );
}

/** Each concern on its own, as an adapter composes them. */
export function concerns(
  sink: UwtTelemetrySink,
  logApi: UwtLogApiProvider
): unknown[] {
  const config = uwtResolveTelemetryConfig();
  const shared = { identity, redact: config.redaction, report };
  const scenarioOptions: UwtScenarioTelemetryOptions = {
    ...shared,
    config: config.scenarios,
    sink,
    document: null
  };
  const biOptions: UwtBITelemetryOptions = {
    ...shared,
    config: config.bi,
    sink
  };
  const logOptions: UwtLogTelemetryOptions = {
    ...shared,
    config: config.logging,
    logApi,
    sink,
    document: null
  };
  return [
    new UwtScenarioTelemetry(scenarioOptions),
    new UwtBITelemetry(biOptions),
    new UwtLogTelemetry(logOptions)
  ];
}

/** A composed page without a framework: a fragment, and the shell hosting it. */
export function composedPage(
  shellSink: UwtTelemetrySink,
  shellLogs: UwtLogApiProvider
): () => void {
  const connectOptions: UwtBroadcastConnectOptions = {
    channelName: UWT_DEFAULT_BROADCAST_CHANNEL,
    open: true,
    report
  };
  const connection: UwtBroadcastConnection =
    uwtConnectBroadcastChannel(connectOptions);
  const sinkOptions: UwtBroadcastTelemetrySinkOptions = {
    identity,
    connection
  };
  const logOptions: UwtBroadcastLogApiProviderOptions = {
    connection,
    runOutside: (callback) => callback(),
    runInside: (callback) => callback()
  };
  const fragment = uwtCreateTelemetry({
    identity,
    destination: new UwtBroadcastTelemetrySink(sinkOptions),
    logApi: new UwtBroadcastLogApiProvider(logOptions)
  });

  const hostOptions: UwtTelemetryBroadcastHostOptions = {
    sink: shellSink,
    logApi: shellLogs,
    report
  };
  const host = new UwtTelemetryBroadcastHost(hostOptions);
  const flush: UwtBroadcastMessage = { kind: 'flush', beacon: true };
  connection.post(flush);

  return () => {
    report('warn', `${host.received} of ${UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS}`);
    fragment.dispose();
    host.dispose();
    connection.close();
  };
}

/** RUM credentials from the application's broker. */
export class AppRumCredentials implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    const config: UwtRumAppMonitorConfig = {
      applicationId: 'app-monitor',
      region: 'eu-west-1',
      applicationVersion: '1.0.0'
    };
    const credentials: UwtRumCredentials = {
      accessKeyId: 'a',
      secretAccessKey: 's',
      sessionToken: 't',
      expiration: '2026-01-01T00:00:00Z'
    };
    return { config, credentials };
  }
}

/** Sending straight to AWS CloudWatch RUM, without a framework. */
export async function rum(page: UwtRumDocument | null): Promise<void> {
  const options: UwtRumTelemetrySinkOptions = {
    identity,
    credentialsProvider: new AppRumCredentials(),
    document: page,
    report: uwtConsoleReporter
  };
  const destination = new UwtRumTelemetrySink(options);
  await destination.init();
  destination.recordPageView('/customers/:id');
  const telemetry = uwtCreateTelemetry({
    identity,
    destination,
    logApi: new UwtNoopLogApiProvider()
  });
  const level: UwtReportLevel = 'config';
  uwtReport(
    report,
    level,
    'checked',
    uwtSessionElapsed(destination.getSessionId())
  );
  telemetry.dispose();
  destination.dispose();
}
