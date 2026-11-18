import { Injectable } from '@angular/core';
import { UwtNoopLogApiProvider as CoreNoopLogApiProvider } from '@absaoss-cps/ui-watchtower';

/**
 * Log API provider that discards every record and finds none.
 *
 * The explicit way to say an application has no log backend — never a
 * default, like `provideUwtTelemetrySink('noop')`. Mostly for a shell that
 * hosts fragments with {@link provideUwtTelemetryBroadcastHost} but logs
 * nothing: the host requires a log provider, so that one can't be
 * forgotten.
 *
 * Bound in a shell, it discards its fragments' log records too.
 *
 * @example
 * ```typescript
 * providers: [
 *   { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider },
 *   provideUwtTelemetryBroadcastHost()
 * ]
 * ```
 *
 * @group Services
 */
@Injectable()
export class UwtNoopLogApiProvider extends CoreNoopLogApiProvider {}
