import { Injectable } from '@angular/core';
import {
  UWT_RUM_CREDENTIALS_PROVIDER,
  UwtRumBootstrap,
  UwtRumCredentialsProvider,
  provideUwtTelemetryRumSink
} from '@absaoss-cps/ngx-ui-watchtower/rum';

/** RUM, switched off by its broker: the smoke test sends nothing. */
@Injectable({ providedIn: 'root' })
class SmokeRumCredentials implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    return null;
  }
}

/**
 * The `rum` configuration's destination: the published `/rum` entry point,
 * whose `aws-rum-web` the smoke test must then find in the build.
 */
export const destination = [
  provideUwtTelemetryRumSink(),
  { provide: UWT_RUM_CREDENTIALS_PROVIDER, useExisting: SmokeRumCredentials }
];
