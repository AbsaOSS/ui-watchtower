import { UwtLogConfig } from '../../config/uwt-log.config/uwt-log.config';
import { UwtTelemetryIdentity } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import {
  UWT_LOG_LEVEL_ORDER,
  UwtLogDetail,
  UwtLogger,
  UwtLoggerName,
  UwtLogLevel,
  UwtLogRecord
} from '../../models/uwt-log.models/uwt-log.models';
import {
  UwtLogApiProvider,
  UwtLogQuery
} from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { uwtDebugWrite } from '../../utils/uwt-debug-flag.util/uwt-debug-flag.util';
import {
  uwtNormalizeError,
  UwtRedactConfig,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  uwtScrubString
} from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import {
  UwtReporter,
  uwtSafe,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import {
  uwtListenToPage,
  UwtTelemetryDocument,
  uwtTelemetryDocument
} from '../uwt-telemetry-page/uwt-telemetry-page';

/** Handed out while telemetry is off: every call does nothing. */
const INERT_LOGGER: UwtLogger = Object.freeze({
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined
});

/**
 * What {@link UwtLogTelemetry} needs.
 *
 * @group Interfaces
 */
export interface UwtLogTelemetryOptions {
  /** The application's identity, shared by every concern. */
  identity: UwtTelemetryIdentity;
  /** Logging settings, complete; see {@link uwtResolveTelemetryConfig}. */
  config: UwtLogConfig;
  /**
   * Redaction settings shared by every concern. `config.redact: false`
   * turns their configurable part off for log records.
   */
  redact: UwtRedactConfig;
  /** The application's log store: where records go, and are read back from. */
  logApi: UwtLogApiProvider;
  /**
   * The telemetry destination, for enrichment only: records carry its
   * `sessionId` and `userId`, and `config.mirrorErrorsToRum` reports errors
   * to it. Optional.
   */
  sink?: UwtTelemetrySink | null;
  /** `false` makes every logger and query inert. Default `true`. */
  enabled?: boolean;
  /**
   * The page whose lifecycle flushes the log store: on `pagehide`, and when
   * the page is hidden. Defaults to the global `document` where there is
   * one; `null` listens to nothing.
   */
  document?: UwtTelemetryDocument | null;
  /** Receives what is handled silently; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * Structured application logging.
 *
 * Log records go to the application's {@link UwtLogApiProvider}, **not** to
 * the telemetry destination — RUM is a sampled, session-capped analytics
 * stream, while logs need full fidelity and their own retention.
 *
 * Console output is off unless the `debugLogger` LocalStorage flag is set, in
 * any environment:
 *
 * ```js
 * localStorage.setItem('debugLogger', 'true');
 * ```
 *
 * Every record carries a logger name, so this writes nothing itself —
 * {@link getLogger} hands back the {@link UwtLogger} you call.
 *
 * @example
 * ```typescript
 * const logger = telemetry.logging.getLogger('checkout');
 *
 * try {
 *   // …
 * } catch (error) {
 *   logger.error('Failed to load customer data', {
 *     error,
 *     correlationId: scenario.id
 *   });
 * }
 * ```
 *
 * @group Classes
 */
export class UwtLogTelemetry {
  private readonly identity: UwtTelemetryIdentity;
  private readonly config: UwtLogConfig;
  private readonly redact: UwtRedactConfig;
  private readonly logApi: UwtLogApiProvider;
  private readonly sink: UwtTelemetrySink | null;
  private readonly enabled: boolean;
  private readonly report?: UwtReporter;
  private readonly stopListening: () => void;
  private disposed = false;

  /**
   * One logger per name, so {@link getLogger} is idempotent.
   *
   * Unbounded growth is not a concern the way it is for active scenarios:
   * names come from the closed {@link UwtLoggerNames} vocabulary, so this
   * map is bounded by what the application declared at build time.
   */
  private readonly loggers = new Map<UwtLoggerName, UwtLogger>();

  constructor(options: UwtLogTelemetryOptions) {
    this.identity = options.identity;
    this.config = options.config;
    this.redact = uwtRedactConfigFor(options.redact, options.config.redact);
    this.logApi = options.logApi;
    this.sink = options.sink ?? null;
    this.enabled = options.enabled !== false;
    this.report = options.report;
    // Page listeners: only while telemetry is on.
    this.stopListening = this.enabled
      ? uwtListenToPage(
          uwtTelemetryDocument(options.document),
          () => this.flushProvider(),
          () => this.flushProvider()
        )
      : () => undefined;
  }

  /**
   * Reads records back from the application's log store. Useful for
   * pulling one journey together — every line written during a scenario
   * shares its id as the correlation id:
   *
   * @example
   * ```typescript
   * const lines = await telemetry.logging.query({ correlationId: scenario.id });
   * ```
   *
   * Fail-open: a provider that throws or rejects resolves to `[]`.
   *
   * @param filter narrows what is returned
   * @returns the matching records, or `[]` when none can be read
   */
  async query(filter: UwtLogQuery = {}): Promise<UwtLogRecord[]> {
    if (!this.enabled || this.disposed) {
      return [];
    }
    const pending = uwtSafe(
      'logger.query',
      () => this.logApi.query(filter),
      undefined,
      this.report
    );

    return (await pending?.catch(() => undefined)) ?? [];
  }

  /**
   * Returns the named logger for one part of the application — the only
   * way to write a log record.
   *
   * The name lands on every record as `logger`, and four things key off
   * it: {@link UwtLogConfig.levels} per-logger severity floors, the
   * `debugLogger` flag's comma-separated filter, `query({ logger })`
   * against the log store, and the console line's prefix. A record
   * without one is reachable by none of them, which is why there is no
   * unnamed `log`/`warn`/`error` here.
   *
   * The name is identity, not a label: asking twice returns the very same
   * logger, the way a file name always refers to one file.
   *
   * @param name the logger name, declared in {@link UwtLoggerNames}
   * @returns the logger for that name, created once and reused; an inert
   *   one while telemetry is off
   */
  getLogger(name: UwtLoggerName): UwtLogger {
    if (!this.enabled) {
      return INERT_LOGGER;
    }
    const cached = uwtSafe(
      'logger.getLogger',
      () => this.loggers.get(name),
      undefined,
      this.report
    );
    if (cached) {
      return cached;
    }

    const logger = this.createLogger(name);
    uwtSafeVoid(
      'logger.register',
      () => this.loggers.set(name, logger),
      this.report
    );
    return logger;
  }

  /**
   * Stops watching the page and gives the log store its last chance to
   * ship what it holds; every logger writes nothing from then on. Calling
   * it again does nothing.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopListening();
    if (this.enabled) {
      this.flushProvider();
    }
  }

  /**
   * Builds the logger for one name.
   *
   * Private, and reached only through {@link getLogger}, so every logger
   * handed out is registered and named. The name is captured here rather
   * than read from each call's detail, which is why a record's `logger`
   * cannot disagree with the logger that wrote it.
   *
   * @param name the logger name stamped onto every record it writes
   * @returns a logger bound to that name
   */
  private createLogger(name: UwtLoggerName): UwtLogger {
    return {
      log: (message, detail) => this.emit('log', name, message, detail),
      warn: (message, detail) => this.emit('warn', name, message, detail),
      error: (message, detail) => this.emit('error', name, message, detail)
    };
  }

  /** Severity floor for one logger — its own override, or the global one. */
  private minLevelFor(logger: UwtLoggerName): UwtLogLevel {
    const { levels, minLevel } = this.config;
    return levels?.[logger] ?? minLevel;
  }

  private emit(
    level: UwtLogLevel,
    logger: UwtLoggerName,
    message: string,
    detail?: UwtLogDetail
  ): void {
    if (this.disposed) {
      return;
    }
    uwtSafeVoid(
      `logger.${level}`,
      () => {
        if (
          UWT_LOG_LEVEL_ORDER[level] <
          UWT_LOG_LEVEL_ORDER[this.minLevelFor(logger)]
        ) {
          return;
        }

        const record = this.buildRecord(level, logger, message, detail);

        uwtDebugWrite(
          'debugLogger',
          () => writeToConsole(record),
          record.logger,
          this.report
        );

        this.deliver(record);

        if (level === 'error' && this.config.mirrorErrorsToRum && this.sink) {
          const mirrored =
            record.error ??
            uwtNormalizeError(
              new Error(record.message),
              this.redact,
              this.report
            );
          if (mirrored) {
            this.sink.recordError(mirrored);
          }
        }
      },
      this.report
    );
  }

  /** Guards against a throwing or secretly-async, rejecting provider. */
  private deliver(record: UwtLogRecord): void {
    uwtSafeVoidMaybeAsync(
      'logger.deliver',
      () => this.logApi.send(record),
      this.report
    );
  }

  /** Gives the provider its chance to ship whatever it has queued itself. */
  private flushProvider(): void {
    uwtSafeVoidMaybeAsync(
      'logger.providerFlush',
      () => this.logApi.flush?.(),
      this.report
    );
  }

  private buildRecord(
    level: UwtLogLevel,
    logger: UwtLoggerName,
    message: string,
    detail?: UwtLogDetail
  ): UwtLogRecord {
    const { identity, redact, report, sink } = this;

    return {
      timestamp: new Date().toISOString(),
      level,
      message: uwtScrubString(String(message ?? ''), redact, report),
      logger,
      context: detail?.context
        ? uwtScrubString(detail.context, redact, report)
        : undefined,
      metadata: uwtRedactMetadata(detail?.metadata, redact, report),
      error: uwtNormalizeError(detail?.error, redact, report),
      correlationId: detail?.correlationId
        ? uwtScrubString(detail.correlationId, redact, report)
        : undefined,
      application: identity.application,
      environment: identity.environment,
      version: identity.version,
      ...(sink && {
        userId: uwtSafe('getUserId', () => sink.getUserId(), undefined, report),
        sessionId: uwtSafe(
          'getSessionId',
          () => sink.getSessionId(),
          undefined,
          report
        )
      })
    };
  }
}

/**
 * Prints the record exactly as the transport receives it.
 *
 * Prefixed with the application - in a composed
 * page every realm writes to the one console - then the logger name and
 * the context, each when present.
 */
function writeToConsole(record: UwtLogRecord): void {
  const scope = [record.logger, record.context]
    .filter(Boolean)
    .map((part) => `[${part}]`)
    .join('');
  const suffix = record.correlationId ? ` (${record.correlationId})` : '';

  console[record.level](
    `[${record.application}]${scope} ${record.message}${suffix}`,
    record
  );
}
