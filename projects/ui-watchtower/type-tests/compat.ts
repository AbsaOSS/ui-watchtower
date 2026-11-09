/**
 * The core's public API used the way a framework-free application, or an
 * integration, uses it. Compiled by `npm run typecheck` with plain `tsc`,
 * never run: no framework is involved anywhere. No registry is augmented
 * here, so every name is a plain string; see `augmented.ts` for registered
 * names.
 */
import {
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_LOG_LEVEL_ORDER,
  UWT_REDACTED,
  UWT_TELEMETRY_EVENT_TYPE,
  UwtBITelemetryConfig,
  uwtClassifyTelemetryEvent,
  UwtDebugFlag,
  uwtEventTypes,
  uwtIsDebugEnabled,
  UwtLogApiProvider,
  UwtLogConfig,
  UwtLogLevel,
  UwtLogQuery,
  UwtLogRecord,
  uwtMarkSessionStart,
  uwtNormalizeError,
  UwtPiiValuePattern,
  UwtRedactConfig,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  UwtReporter,
  UwtScenario,
  UwtScenarioRecord,
  UwtScenarioTelemetryConfig,
  uwtScrubString,
  UwtTelemetryError,
  UwtTelemetryIdentity,
  UwtTelemetryMetadata,
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
  console[level](`[app] ${message}`, ...details);

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
