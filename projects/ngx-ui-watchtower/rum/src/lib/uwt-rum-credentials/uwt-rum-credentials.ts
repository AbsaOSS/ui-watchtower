import { InjectionToken } from '@angular/core';
import type { UwtRumCredentialsProvider } from '@absaoss-cps/ui-watchtower/rum';

export type {
  UwtRumAppMonitorConfig,
  UwtRumBootstrap,
  UwtRumCredentials,
  UwtRumCredentialsProvider
} from '@absaoss-cps/ui-watchtower/rum';

/**
 * Binds the application's {@link UwtRumCredentialsProvider}.
 *
 * @group Tokens
 */
export const UWT_RUM_CREDENTIALS_PROVIDER =
  new InjectionToken<UwtRumCredentialsProvider>('UWT_RUM_CREDENTIALS_PROVIDER');
