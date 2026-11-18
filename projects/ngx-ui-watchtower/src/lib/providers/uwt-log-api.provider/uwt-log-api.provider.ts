import { InjectionToken } from '@angular/core';
import type { UwtLogApiProvider } from '@absaoss-cps/ui-watchtower';

/**
 * Binds the application's {@link UwtLogApiProvider}.
 *
 * Bound by the application; `provideUwtTelemetry` wires everything else.
 * Has no default — an unbound provider fails at injection rather than
 * silently discarding logs. To keep no logs, say so with
 * {@link UwtNoopLogApiProvider}.
 *
 * @group Tokens
 */
export const UWT_LOG_API_PROVIDER = new InjectionToken<UwtLogApiProvider>(
  'UWT_LOG_API_PROVIDER'
);
