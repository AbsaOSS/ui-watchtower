import { inject, Injectable, OnDestroy } from '@angular/core';
import {
  UwtLogger,
  UwtLoggerName,
  UwtLogQuery,
  UwtLogRecord,
  UwtLogTelemetry,
  UwtTelemetrySink
} from '@absaoss-cps/ui-watchtower';
import {
  UWT_REDACT_CONFIG,
  uwtTelemetryEnabled,
  UWT_TELEMETRY_IDENTITY
} from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UWT_LOG_CONFIG } from '../../config/uwt-log.config/uwt-log.config';
import { UWT_LOG_API_PROVIDER } from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import {
  uwtBrowserDocument,
  uwtDevModeReporter
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Structured application logging.
 *
 * Log records go to the application's {@link UwtLogApiProvider}, **not** to
 * AWS RUM — RUM is a sampled, session-capped analytics stream, while logs
 * need full fidelity and their own retention.
 *
 * Console output is off unless the `debugLogger` LocalStorage flag is set, in
 * any environment:
 *
 * ```js
 * localStorage.setItem('debugLogger', 'true');
 * ```
 *
 * Every record carries a logger name, so the service itself writes
 * nothing — {@link getLogger} hands back the {@link UwtLogger} you call.
 *
 * @example
 * ```typescript
 * class CheckoutService {
 *   private readonly logger = inject(UwtLoggerService).getLogger('checkout');
 *
 *   load(scenario: UwtScenario) {
 *     try {
 *       // …
 *     } catch (error) {
 *       this.logger.error('Failed to load customer data', {
 *         error,
 *         correlationId: scenario.id
 *       });
 *     }
 *   }
 * }
 * ```
 *
 * @group Services
 */
@Injectable({ providedIn: 'root' })
export class UwtLoggerService implements OnDestroy {
  /** The core's logging, configured from this injector. */
  private readonly logging = new UwtLogTelemetry({
    identity: inject(UWT_TELEMETRY_IDENTITY),
    config: inject(UWT_LOG_CONFIG),
    redact: inject(UWT_REDACT_CONFIG),
    // Enrichment only (`sessionId`/`userId`, optional RUM mirroring).
    sink: inject(UwtTelemetrySink, { optional: true }),
    logApi: inject(UWT_LOG_API_PROVIDER),
    document: uwtBrowserDocument(),
    enabled: uwtTelemetryEnabled(),
    report: uwtDevModeReporter
  });

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.logging.dispose();
  }

  /**
   * Reads records back from the application's log backend. Useful for
   * pulling one journey together — every line written during a scenario
   * shares its id as the correlation id:
   *
   * @example
   * ```typescript
   * class JourneyService {
   *   private readonly loggerService = inject(UwtLoggerService);
   *
   *   linesOf(scenario: UwtScenario): Promise<UwtLogRecord[]> {
   *     return this.loggerService.query({ correlationId: scenario.id });
   *   }
   * }
   * ```
   *
   * Fail-open: a provider that throws or rejects resolves to `[]`.
   *
   * @param filter narrows what is returned
   * @returns the matching records, or `[]` when none can be read
   */
  query(filter: UwtLogQuery = {}): Promise<UwtLogRecord[]> {
    return this.logging.query(filter);
  }

  /**
   * Returns the named logger for one part of the application — the only
   * way to write a log record.
   *
   * The name lands on every record as `logger`, and four things key off
   * it: {@link UwtLogConfig.levels} per-logger severity floors, the
   * `debugLogger` flag's comma-separated filter, `query({ logger })`
   * against the log backend, and the console line's prefix. A record
   * without one is reachable by none of them, which is why the service
   * exposes no unnamed `log`/`warn`/`error` of its own.
   *
   * Declare the name in {@link UwtLoggerNames} first, and bind it once as
   * a field:
   *
   * @example
   * ```typescript
   * class CheckoutService {
   *   private readonly logger = inject(UwtLoggerService).getLogger('checkout');
   *
   *   submit() {
   *     this.logger.log('Submitting order');
   *   }
   * }
   * ```
   *
   * The name is identity, not a label: asking twice returns the very same
   * logger, the way a file name always refers to one file.
   *
   * @param name the logger name, declared in {@link UwtLoggerNames}
   * @returns the logger for that name, created once and reused
   */
  getLogger(name: UwtLoggerName): UwtLogger {
    return this.logging.getLogger(name);
  }
}
