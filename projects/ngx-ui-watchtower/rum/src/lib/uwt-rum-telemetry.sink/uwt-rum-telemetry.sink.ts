import { DestroyRef, inject, Injectable, OnDestroy } from '@angular/core';
import {
  UWT_REDACT_CONFIG,
  UWT_TELEMETRY_ENABLED,
  UWT_TELEMETRY_IDENTITY
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtRumTelemetrySink as CoreRumTelemetrySink } from '@absaoss-cps/ui-watchtower/rum';
import { UWT_RUM_CREDENTIALS_PROVIDER } from '../uwt-rum-credentials/uwt-rum-credentials';
import {
  uwtBrowserDocument,
  uwtDevModeReporter,
  uwtRunOutsideZone
} from '../uwt-rum-internal.util/uwt-rum-internal.util';

/**
 * Telemetry sink backed by the AWS CloudWatch RUM web client.
 *
 * Custom scenario and BI events travel through `recordEvent`, alongside the
 * page views, web vitals, JS errors, HTTP failures and resource timing the
 * client records on its own. The SDK is imported lazily, so an application
 * that never provides this sink never pays for the bundle. Every operation
 * is fail-open: if the broker is down, credentials lapse, or the SDK
 * throws, the application behaves as if RUM were healthy.
 *
 * @group Services
 */
@Injectable()
export class UwtRumTelemetrySink
  extends CoreRumTelemetrySink
  implements OnDestroy
{
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    super({
      identity: inject(UWT_TELEMETRY_IDENTITY),
      redact: inject(UWT_REDACT_CONFIG),
      credentialsProvider: inject(UWT_RUM_CREDENTIALS_PROVIDER),
      document: uwtBrowserDocument(),
      enabled: inject(UWT_TELEMETRY_ENABLED, { optional: true }) ?? true,
      runOutside: uwtRunOutsideZone(),
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
