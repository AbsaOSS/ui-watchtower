import { DestroyRef, inject, Injectable, OnDestroy } from '@angular/core';
import { UwtBroadcastTelemetrySink as CoreBroadcastTelemetrySink } from '@absaoss-cps/ui-watchtower';
import { UWT_TELEMETRY_IDENTITY } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { uwtDevModeReporter } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { uwtBroadcastConnectionOptions } from './uwt-broadcast.messages';

/**
 * Telemetry sink for a follower realm — a micro-frontend fragment, a webview
 * panel, any context with its own JavaScript realm but the same origin.
 *
 * Creates no AWS client of its own. Events are forwarded over a
 * `BroadcastChannel` to the realm running
 * {@link provideUwtTelemetryBroadcastHost}, which records them through the one
 * real sink. Application code sees no difference — it injects the same
 * services and calls the same methods.
 *
 * @example
 * ```typescript
 * providers: [
 *   provideUwtTelemetry({ application: 'cart', environment: 'prod', version: '1.0.0' }),
 *   provideUwtTelemetrySink('broadcast')
 * ]
 * ```
 *
 * @group Services
 */
@Injectable()
export class UwtBroadcastTelemetrySink
  extends CoreBroadcastTelemetrySink
  implements OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    super({
      identity: inject(UWT_TELEMETRY_IDENTITY),
      ...uwtBroadcastConnectionOptions(),
      report: uwtDevModeReporter
    });
    // Runs after every service's ngOnDestroy, so their last records still go
    // out.
    this.destroyRef.onDestroy(() => this.dispose());
  }

  /** @inheritdoc */
  ngOnDestroy(): void {
    // The injector's own call is finished by the callback above; a direct
    // call (a test, a subclass) still disposes at once.
    if (!this.destroyRef.destroyed) {
      this.dispose();
    }
  }
}
