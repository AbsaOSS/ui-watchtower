import { inject, Injectable, InjectionToken, OnDestroy } from '@angular/core';
import {
  UWT_DEFAULT_BROADCAST_CHANNEL,
  UwtBroadcastConnection,
  uwtConnectBroadcastChannel as coreConnectBroadcastChannel
} from '@absaoss-cps/ui-watchtower';
import { uwtTelemetryEnabled } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import {
  uwtDevModeReporter,
  uwtIsBrowser
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

export { UWT_DEFAULT_BROADCAST_CHANNEL } from '@absaoss-cps/ui-watchtower';

/**
 * Overrides the channel name shared by the host and its followers.
 *
 * Both sides must agree. Change it only to run two independent telemetry
 * networks on one origin.
 *
 * @group Tokens
 */
export const UWT_BROADCAST_CHANNEL = new InjectionToken<string>(
  'UWT_BROADCAST_CHANNEL'
);

/**
 * Where this injector's realm connects: the channel name — the
 * {@link UWT_BROADCAST_CHANNEL} override, or the default — and whether a
 * channel may open at all: only in a browser, while telemetry is on. Must be
 * called from an injection context.
 */
export function uwtBroadcastChannelOptions(): {
  channelName: string;
  enabled: boolean;
} {
  return {
    channelName:
      inject(UWT_BROADCAST_CHANNEL, { optional: true }) ??
      UWT_DEFAULT_BROADCAST_CHANNEL,
    enabled: uwtIsBrowser() && uwtTelemetryEnabled()
  };
}

/**
 * Opens this realm's connection to the shared broadcast channel, configured
 * from this injector, reporting through the dev-mode reporter. Must be called
 * from an injection context (a field initializer or a constructor).
 */
export function uwtConnectBroadcastChannel(
  operation: string
): UwtBroadcastConnection {
  const { channelName, enabled } = uwtBroadcastChannelOptions();
  return coreConnectBroadcastChannel({
    channelName,
    open: enabled,
    operation,
    report: uwtDevModeReporter
  });
}

/**
 * The one connection a realm's broadcast sink and log provider share:
 * provided with them by `provideUwtTelemetrySink('broadcast')`, and closed
 * with their injector. Internal.
 */
@Injectable()
export class UwtBroadcastConnectionRef implements OnDestroy {
  readonly connection = uwtConnectBroadcastChannel('broadcast');

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.connection.close();
  }
}

/**
 * How a broadcast sink or log provider connects: through its injector's
 * shared connection when there is one, on its own otherwise. Must be called
 * from an injection context.
 */
export function uwtBroadcastConnectionOptions():
  | { connection: UwtBroadcastConnection }
  | { channelName: string; enabled: boolean } {
  const shared = inject(UwtBroadcastConnectionRef, { optional: true });
  return shared
    ? { connection: shared.connection }
    : uwtBroadcastChannelOptions();
}
