import { InjectionToken } from '@angular/core';
import type { UwtBITelemetryConfig } from '@absaoss-cps/ui-watchtower';

/**
 * Resolved BI event configuration. Provided by {@link provideUwtTelemetry},
 * overridden with `withBIEvents(...)`.
 *
 * @group Tokens
 */
export const UWT_BI_TELEMETRY_CONFIG = new InjectionToken<UwtBITelemetryConfig>(
  'UWT_BI_TELEMETRY_CONFIG'
);
