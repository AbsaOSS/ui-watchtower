import { Injectable, OnDestroy } from '@angular/core';
import { UwtBroadcastLogApiProvider as CoreBroadcastLogApiProvider } from '@absaoss-cps/ui-watchtower';
import { uwtBroadcastConnectionOptions } from '../../sinks/uwt-broadcast/uwt-broadcast.messages';
import {
  uwtDevModeReporter,
  uwtRunInsideZone,
  uwtRunOutsideZone
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

export { UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS } from '@absaoss-cps/ui-watchtower';

/**
 * Log API provider for a follower realm — the log counterpart of
 * {@link UwtBroadcastTelemetrySink}.
 *
 * Ships nothing itself. Records are forwarded over the `BroadcastChannel`
 * to the realm running {@link provideUwtTelemetryBroadcastHost}, which hands
 * them to its own {@link UWT_LOG_API_PROVIDER}: one log backend, one set of
 * credentials, for the whole composed page. Bound by
 * `provideUwtTelemetrySink('broadcast')`.
 *
 * `query()` is answered by the host's provider too. It resolves to `[]`
 * when no host answers within {@link UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS},
 * and at once when no channel could be opened. The timeout runs outside
 * Angular's zone, so a query no host answers doesn't hold the application
 * unstable for its whole length.
 *
 * @group Services
 */
@Injectable()
export class UwtBroadcastLogApiProvider
  extends CoreBroadcastLogApiProvider
  implements OnDestroy
{
  constructor() {
    super({
      ...uwtBroadcastConnectionOptions(),
      runOutside: uwtRunOutsideZone(),
      runInside: uwtRunInsideZone(),
      report: uwtDevModeReporter
    });
  }

  /** Resolves every unanswered query to `[]`, then closes the channel. */
  ngOnDestroy(): void {
    this.dispose();
  }
}
