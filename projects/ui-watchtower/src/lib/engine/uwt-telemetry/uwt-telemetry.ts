import {
  UwtTelemetryConfigOverrides,
  UwtTelemetryIdentity,
  uwtResolveTelemetryConfig
} from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UwtLogApiProvider } from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import {
  UwtReporter,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { UwtBITelemetry } from '../uwt-bi-telemetry/uwt-bi-telemetry';
import { UwtLogTelemetry } from '../uwt-log-telemetry/uwt-log-telemetry';
import { UwtScenarioTelemetry } from '../uwt-scenario-telemetry/uwt-scenario-telemetry';
import {
  UwtTelemetryDocument,
  uwtTelemetryDocument
} from '../uwt-telemetry-page/uwt-telemetry-page';

/**
 * What {@link uwtCreateTelemetry} needs: who the application is, where
 * telemetry and logs go, and anything to change from the defaults.
 *
 * @group Interfaces
 */
export interface UwtTelemetryOptions extends UwtTelemetryConfigOverrides {
  /** The application's identity, carried by every record and event. */
  identity: UwtTelemetryIdentity;
  /**
   * Where scenarios, BI events and mirrored errors go — exactly one.
   * `new UwtNoopTelemetrySink()` sends them nowhere.
   */
  destination: UwtTelemetrySink;
  /**
   * The application's log store. `new UwtNoopLogApiProvider()` keeps no
   * logs, said explicitly.
   */
  logApi: UwtLogApiProvider;
  /**
   * `false` makes everything inert: nothing is recorded, redacted, timed,
   * sent or logged, and nothing listens to the page. Default `true`.
   */
  enabled?: boolean;
  /**
   * The page whose lifecycle settles and flushes telemetry. Defaults to the
   * global `document` where there is one; `null` listens to nothing, as on
   * a server.
   */
  document?: UwtTelemetryDocument | null;
  /**
   * Runs timer scheduling outside the host framework's change detection,
   * when it has one.
   */
  runOutside?: <T>(callback: () => T) => T;
  /**
   * Receives what telemetry handles silently: failures it skipped, data it
   * dropped. Nothing is reported without one; see {@link UwtReporter}.
   */
  report?: UwtReporter;
}

/**
 * A configured telemetry engine: one per application, or per fragment in a
 * composed page.
 *
 * @group Interfaces
 */
export interface UwtTelemetry {
  /** Scenarios — user journeys and their health. */
  readonly scenarios: UwtScenarioTelemetry;
  /** Business and UX events. */
  readonly bi: UwtBITelemetry;
  /** Structured application logs. */
  readonly logging: UwtLogTelemetry;
  /**
   * Attributes telemetry from now on to an application user, or to nobody
   * (`undefined`, or `''`). Passed to the destination.
   */
  setUserId(userId: string | undefined): void;
  /**
   * Sends what the destination and the log store hold.
   *
   * @param beacon use a transport that survives page unload
   */
  flush(beacon?: boolean): void;
  /**
   * Stops watching the page, settles scenarios still in flight as abandoned
   * and flushes. Scenarios and BI events are inert from then on, and no
   * listener or timer of this engine is left. Loggers you hold keep writing
   * to the log store, which stays yours, like the destination: something may
   * still log while the application shuts down. Calling it again does
   * nothing.
   */
  dispose(): void;
}

/**
 * Creates a telemetry engine: scenarios, BI events and logging, all sending
 * to one destination and one log store. Needs no framework.
 *
 * @example
 * ```typescript
 * const telemetry = uwtCreateTelemetry({
 *   identity: { application: 'cart', environment: 'prod', version: '1.4.0' },
 *   destination: new UwtNoopTelemetrySink(),
 *   logApi: new UwtNoopLogApiProvider(),
 *   logging: { minLevel: 'warn' }
 * });
 *
 * const scenario = telemetry.scenarios.start({ name: 'checkout' });
 * scenario.step('pay');
 * scenario.complete();
 *
 * telemetry.dispose();
 * ```
 *
 * @param options identity, destination, log store and overrides
 * @returns the engine
 * @throws when the identity (its application, environment and version), the
 *   destination or the log store is missing
 *
 * @group Utils
 */
export function uwtCreateTelemetry(options: UwtTelemetryOptions): UwtTelemetry {
  assertOptions(options);
  const { identity, destination, logApi, report } = options;
  const enabled = options.enabled !== false;
  const config = uwtResolveTelemetryConfig(options);
  const document = uwtTelemetryDocument(options.document);
  const shared = { identity, redact: config.redaction, enabled, report };

  const scenarios = new UwtScenarioTelemetry({
    ...shared,
    config: config.scenarios,
    sink: destination,
    document,
    runOutside: options.runOutside
  });
  const bi = new UwtBITelemetry({
    ...shared,
    config: config.bi,
    sink: destination
  });
  const logging = new UwtLogTelemetry({
    ...shared,
    config: config.logging,
    logApi,
    sink: destination,
    document
  });

  let disposed = false;
  const live = () => enabled && !disposed;

  return {
    scenarios,
    bi,
    logging,
    setUserId(userId) {
      if (live()) {
        uwtSafeVoid(
          'telemetry.setUserId',
          () => destination.setUserId(userId),
          report
        );
      }
    },
    flush(beacon) {
      if (live()) {
        uwtSafeVoid('telemetry.flush', () => destination.flush(beacon), report);
        uwtSafeVoidMaybeAsync(
          'telemetry.logFlush',
          () => logApi.flush?.(),
          report
        );
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      scenarios.dispose();
      logging.dispose();
      bi.dispose();
    }
  };
}

/** Configuration errors throw: telemetry fails open, its setup does not. */
function assertOptions(options: UwtTelemetryOptions): void {
  const identity = options?.identity;
  const missing = [
    !identity?.application && 'identity.application',
    // Strings, as every record carries them: a shell's host rejects a
    // forwarded log record without them.
    typeof identity?.environment !== 'string' && 'identity.environment',
    typeof identity?.version !== 'string' && 'identity.version',
    typeof options?.destination?.record !== 'function' && 'destination',
    typeof options?.logApi?.send !== 'function' && 'logApi'
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `[ui-watchtower] uwtCreateTelemetry needs ${missing.join(', ')}`
    );
  }
}
