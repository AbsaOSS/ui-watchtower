import { InjectionToken } from '@angular/core';
import type { UwtScenarioTelemetryConfig } from '@absaoss-cps/ui-watchtower';

/**
 * Resolved scenario telemetry configuration. Provided by
 * {@link provideUwtTelemetry}, overridden with `withScenarios(...)`.
 *
 * @group Tokens
 */
export const UWT_SCENARIO_TELEMETRY_CONFIG =
  new InjectionToken<UwtScenarioTelemetryConfig>(
    'UWT_SCENARIO_TELEMETRY_CONFIG'
  );
