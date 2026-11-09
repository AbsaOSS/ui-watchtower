import { inject, Injectable, OnDestroy } from '@angular/core';
import {
  UwtTelemetryBroadcastHost as CoreTelemetryBroadcastHost,
  UwtTelemetrySink
} from '@absaoss-cps/ui-watchtower';
import { UWT_LOG_API_PROVIDER } from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import { uwtHostReporter } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { uwtBroadcastChannelOptions } from './uwt-broadcast.messages';

/**
 * Receives telemetry forwarded by follower realms and records it through this
 * realm's sink.
 *
 * Runs in the shell, the realm with the real sink. Fragments using
 * {@link UwtBroadcastTelemetrySink} post their events here, so one AWS client,
 * one session and one event budget serve the whole composed page. Their
 * scenario, BI and log records are stamped with this realm's current session
 * and user, which a fragment's own copy can lag behind.
 *
 * Fragments' log records arrive the same way, from
 * {@link UwtBroadcastLogApiProvider}, and go to this realm's
 * {@link UWT_LOG_API_PROVIDER} — which also answers their `query()` calls.
 * The provider is required: a shell hosting fragments without one fails at
 * injection, rather than silently discarding their logs.
 *
 * A realm that forwards its own telemetry — `provideUwtTelemetrySink('broadcast')`
 * — cannot also host it: the host would receive its own realm's messages
 * and forward them again, forever. Such a host warns and stays inactive.
 *
 * A Web Locks-based election ({@link uwtElectBroadcastHostLeader}) keeps
 * exactly one host active per channel; others stay passive.
 *
 * @example
 * ```typescript
 * import { provideUwtTelemetryRumSink } from '@absaoss-cps/ngx-ui-watchtower/rum';
 *
 * providers: [
 *   provideUwtTelemetry({ application: 'shell', environment: 'prod', version: '1.0.0' }),
 *   provideUwtTelemetryRumSink(),
 *   { provide: UWT_LOG_API_PROVIDER, useExisting: MyLogBackend },
 *   provideUwtTelemetryBroadcastHost()
 * ]
 * ```
 *
 * @group Services
 */
@Injectable()
export class UwtTelemetryBroadcastHost
  extends CoreTelemetryBroadcastHost
  implements OnDestroy
{
  constructor() {
    super({
      sink: inject(UwtTelemetrySink),
      logApi: inject(UWT_LOG_API_PROVIDER),
      ...uwtBroadcastChannelOptions(),
      report: uwtHostReporter
    });
  }

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.dispose();
  }
}
