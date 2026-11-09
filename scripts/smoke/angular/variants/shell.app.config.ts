import {
  ApplicationConfig,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  UWT_LOG_API_PROVIDER,
  UwtNoopLogApiProvider
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  provideUwtTelemetryRumSink,
  UWT_RUM_CREDENTIALS_PROVIDER
} from '@absaoss-cps/ngx-ui-watchtower/rum';
import { routes } from './app.routes';

/** A shell: AWS RUM, hosting its fragments. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideUwtTelemetry({
      application: 'smoke',
      environment: 'test',
      version: '1.0.0'
    }),
    provideUwtTelemetryRumSink(),
    {
      provide: UWT_RUM_CREDENTIALS_PROVIDER,
      useValue: { load: async () => null }
    },
    { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider },
    provideUwtTelemetryBroadcastHost()
  ]
};
