import { inject, Injectable } from '@angular/core';
import {
  UwtBIEventDetail,
  UwtBIEventName,
  UwtBITelemetry,
  UwtTelemetryMetadata,
  UwtTelemetrySink
} from '@absaoss-cps/ui-watchtower';
import {
  UWT_REDACT_CONFIG,
  uwtTelemetryEnabled,
  UWT_TELEMETRY_IDENTITY
} from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UWT_BI_TELEMETRY_CONFIG } from '../../config/uwt-bi-telemetry.config/uwt-bi-telemetry.config';
import { uwtDevModeReporter } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

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
 * class CustomerTableComponent {
 *   private biTelemetry = inject(UwtBITelemetryService);
 *
 *   onExport(format: string) {
 *     this.biTelemetry.track('export_clicked', {
 *       exportType: format,
 *       source: 'customer-table'
 *     });
 *   }
 * }
 * ```
 *
 * @group Services
 */
@Injectable({ providedIn: 'root' })
export class UwtBITelemetryService {
  /** The core's BI telemetry, configured from this injector. */
  private readonly bi = new UwtBITelemetry({
    identity: inject(UWT_TELEMETRY_IDENTITY),
    config: inject(UWT_BI_TELEMETRY_CONFIG),
    redact: inject(UWT_REDACT_CONFIG),
    sink: inject(UwtTelemetrySink),
    enabled: uwtTelemetryEnabled(),
    report: uwtDevModeReporter
  });

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
    this.bi.track(eventName, metadata, detail);
  }
}
