import { inject, InjectionToken } from '@angular/core';
import type {
  UwtRedactConfig,
  UwtTelemetryIdentity
} from '@absaoss-cps/ui-watchtower';

/**
 * The application's identity — shared by every concern; see
 * {@link UwtTelemetryIdentity}.
 *
 * @group Tokens
 */
export const UWT_TELEMETRY_IDENTITY = new InjectionToken<UwtTelemetryIdentity>(
  'UWT_TELEMETRY_IDENTITY'
);

/**
 * Resolved redaction configuration, shared by every concern. Provided by
 * {@link provideUwtTelemetry}, overridden with `withRedaction(...)`.
 *
 * @group Tokens
 */
export const UWT_REDACT_CONFIG = new InjectionToken<UwtRedactConfig>(
  'UWT_REDACT_CONFIG'
);

/**
 * Whether telemetry runs at all — scenarios, BI events and logs. Defaults to
 * `true`; set it with `withTelemetryEnabled(...)`. Read once, when the
 * services and destinations are created, so it is fixed for the app's
 * lifetime.
 *
 * When `false`, every service and destination is inert: nothing is recorded,
 * redacted, timed, sent or logged, and no RUM client, broadcast channel or
 * page listener is created.
 *
 * @group Tokens
 */
export const UWT_TELEMETRY_ENABLED = new InjectionToken<boolean>(
  'UWT_TELEMETRY_ENABLED',
  { providedIn: 'root', factory: () => true }
);

/**
 * Reads {@link UWT_TELEMETRY_ENABLED}, treating injectors without a root
 * scope as enabled. Internal.
 */
export function uwtTelemetryEnabled(): boolean {
  return inject(UWT_TELEMETRY_ENABLED, { optional: true }) ?? true;
}
