import { InjectionToken } from '@angular/core';
import type { UwtLogConfig } from '@absaoss-cps/ui-watchtower';

/**
 * Resolved logging configuration. Provided by {@link provideUwtTelemetry},
 * overridden with `withLogging(...)`.
 *
 * @group Tokens
 */
export const UWT_LOG_CONFIG = new InjectionToken<UwtLogConfig>(
  'UWT_LOG_CONFIG'
);
