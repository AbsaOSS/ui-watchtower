import {
  ApplicationConfig,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  provideUwtTelemetry,
  provideUwtTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower';
import { routes } from './app.routes';

/** A fragment: no RUM, and aws-rum-web is not installed. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideUwtTelemetry({
      application: 'smoke',
      environment: 'test',
      version: '1.0.0'
    }),
    provideUwtTelemetrySink('broadcast')
  ]
};
