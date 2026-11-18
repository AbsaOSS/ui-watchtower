import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  UWT_LOG_API_PROVIDER,
  UwtNoopLogApiProvider
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  provideUwtEventInspector,
  UwtEventInspectorService
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import {
  provideUwtTelemetryRumSink,
  UWT_RUM_CREDENTIALS_PROVIDER
} from '@absaoss-cps/ngx-ui-watchtower/rum';
import { routes } from './app.routes';

/**
 * The shell, with the Event Inspector: its service created at startup, so
 * prerendering runs it on the server too.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideAnimations(),
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
    provideUwtTelemetryBroadcastHost(),
    provideUwtEventInspector(),
    provideAppInitializer(() => {
      inject(UwtEventInspectorService);
    })
  ]
};
