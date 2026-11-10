import { UwtBITelemetryConfig } from '../../config/uwt-bi-telemetry.config/uwt-bi-telemetry.config';
import { UwtTelemetryIdentity } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import {
  UwtBIEvent,
  UwtBIEventDetail,
  UwtBIEventName
} from '../../models/uwt-bi.models/uwt-bi.models';
import {
  uwtEventTypes,
  UwtTelemetryEventTypes,
  UwtTelemetryMetadata
} from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { uwtDebugWrite } from '../../utils/uwt-debug-flag.util/uwt-debug-flag.util';
import {
  UwtRedactConfig,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  uwtScrubString
} from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import {
  uwtNow,
  UwtReporter,
  uwtSafe,
  uwtSafeVoid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * What {@link UwtBITelemetry} needs.
 *
 * @group Interfaces
 */
export interface UwtBITelemetryOptions {
  /** The application's identity, shared by every concern. */
  identity: UwtTelemetryIdentity;
  /** BI event settings, complete; see {@link uwtResolveTelemetryConfig}. */
  config: UwtBITelemetryConfig;
  /**
   * Redaction settings shared by every concern. `config.redact: false`
   * turns their configurable part off for BI events.
   */
  redact: UwtRedactConfig;
  /** Where events go. */
  sink: UwtTelemetrySink;
  /** `false` makes {@link UwtBITelemetry.track} do nothing. Default `true`. */
  enabled?: boolean;
  /** Receives what is handled silently; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * Business and UX event tracking — feature adoption, interaction analysis,
 * funnel steps.
 *
 * Unlike scenarios, BI events are discrete: no duration, no lifecycle. Event
 * names and attributes come entirely from the application.
 *
 * Repeated identical events within a short window are collapsed, absorbing
 * double-fires from a `click` handler also bound to `keydown`, or from a
 * user clicking twice.
 *
 * Console output is off unless the `debugBI` LocalStorage flag is set:
 *
 * ```js
 * localStorage.setItem('debugBI', 'true');
 * ```
 *
 * @example
 * ```typescript
 * telemetry.bi.track('export_clicked', {
 *   exportType: format,
 *   source: 'customer-table'
 * });
 * ```
 *
 * @group Classes
 */
export class UwtBITelemetry {
  private readonly identity: UwtTelemetryIdentity;
  private readonly config: UwtBITelemetryConfig;
  private readonly redact: UwtRedactConfig;
  private readonly sink: UwtTelemetrySink;
  private readonly enabled: boolean;
  private readonly report?: UwtReporter;

  private readonly eventTypes: UwtTelemetryEventTypes;
  private readonly lastEmittedAt = new Map<string, number>();

  constructor(options: UwtBITelemetryOptions) {
    this.identity = options.identity;
    this.config = options.config;
    this.redact = uwtRedactConfigFor(options.redact, options.config.redact);
    this.sink = options.sink;
    this.enabled = options.enabled !== false;
    this.report = options.report;
    this.eventTypes = uwtEventTypes(options.identity.eventNamespace);
  }

  /**
   * Records a business or UX event.
   *
   * @param eventName the application's own event name, e.g. `export_clicked`,
   *   as declared in {@link UwtBIEventNames}. Treat it as a metric dimension:
   *   keep the cardinality low and never interpolate an identifier into it.
   * @param metadata flat attributes describing the interaction
   * @param detail optional scenario correlation and feature
   */
  track(
    eventName: UwtBIEventName,
    metadata?: UwtTelemetryMetadata,
    detail?: UwtBIEventDetail
  ): void {
    if (!this.enabled) {
      return;
    }
    uwtSafeVoid(
      'biTelemetry.track',
      () => {
        if (!eventName) {
          return;
        }

        const redactedFeature = detail?.feature
          ? uwtScrubString(detail.feature, this.redact, this.report)
          : undefined;
        const redactedMetadata = uwtRedactMetadata(
          metadata,
          this.redact,
          this.report
        );

        if (
          this.isDuplicate(eventName, redactedMetadata, {
            ...detail,
            feature: redactedFeature
          })
        ) {
          return;
        }

        const event: UwtBIEvent = {
          eventName,
          eventTime: new Date().toISOString(),
          scenarioId: detail?.scenarioId,
          feature: redactedFeature,
          metadata: redactedMetadata,
          application: this.identity.application,
          sessionId: uwtSafe(
            'biTelemetry.getSessionId',
            () => this.sink.getSessionId(),
            undefined,
            this.report
          ),
          userId: uwtSafe(
            'biTelemetry.getUserId',
            () => this.sink.getUserId(),
            undefined,
            this.report
          )
        };

        uwtDebugWrite(
          'debugBI',
          () => writeToConsole(eventName, this.eventTypes.bi, event),
          undefined,
          this.report
        );

        this.sink.record(this.eventTypes.bi, event);
      },
      this.report
    );
  }

  /**
   * Forgets recent events. Tracking still works afterwards: it holds no
   * timer, listener or channel, and something may still track while an
   * application shuts down. Calling it again does nothing more.
   */
  dispose(): void {
    this.lastEmittedAt.clear();
  }

  private isDuplicate(
    eventName: string,
    metadata: UwtTelemetryMetadata | undefined,
    detail?: UwtBIEventDetail
  ): boolean {
    const key = JSON.stringify([
      eventName,
      detail?.scenarioId ?? '',
      detail?.feature ?? '',
      this.metadataKey(metadata)
    ]);
    const now = uwtNow();
    const last = this.lastEmittedAt.get(key);

    if (last !== undefined && now - last < this.config.dedupWindowMs) {
      this.lastEmittedAt.delete(key);
      this.lastEmittedAt.set(key, last);
      return true;
    }

    if (this.lastEmittedAt.size >= this.config.dedupMaxKeys) {
      for (const [staleKey, at] of this.lastEmittedAt) {
        if (now - at >= this.config.dedupWindowMs) {
          this.lastEmittedAt.delete(staleKey);
        }
      }

      if (this.lastEmittedAt.size >= this.config.dedupMaxKeys) {
        const oldestKey = this.lastEmittedAt.keys().next().value;
        if (oldestKey !== undefined) {
          this.lastEmittedAt.delete(oldestKey);
        }
      }
    }

    this.lastEmittedAt.delete(key);
    this.lastEmittedAt.set(key, now);
    return false;
  }

  /**
   * A stable string encoding a flat metadata object's content, for use in
   * the dedup key — otherwise two same-named events with different metadata
   * would collide and the second would be silently dropped. Keys are sorted
   * so property order doesn't affect the result. Callers pass already-
   * redacted metadata — a caller's raw values must never end up as a `Map`
   * key living in this long-lived object's memory for the page lifetime.
   */
  private metadataKey(metadata: UwtTelemetryMetadata | undefined): string {
    if (!metadata) {
      return '';
    }
    return JSON.stringify(
      Object.keys(metadata)
        .sort()
        .map((k) => [k, metadata[k]])
    );
  }
}

/**
 * Prefixed with the application - in a composed
 * page every realm writes to the one console.
 */
function writeToConsole(
  eventName: string,
  eventType: string,
  event: UwtBIEvent
): void {
  console.log(`[${event.application}][bi] ${eventName} -> ${eventType}`, event);
}
