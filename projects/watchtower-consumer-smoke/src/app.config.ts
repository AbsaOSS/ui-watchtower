import {
  ApplicationConfig,
  provideZonelessChangeDetection
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay
} from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  UWT_LOG_API_PROVIDER,
  UwtNoopLogApiProvider,
  provideUwtTelemetry,
  withBIEvents,
  withLogging,
  withScenarios
} from '@absaoss-cps/ngx-ui-watchtower';
import { provideUwtEventInspector } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { destination } from './destination';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(withEventReplay()),
    provideAnimations(),
    provideUwtTelemetry(
      { application: 'consumer-smoke', environment: 'smoke', version: '1.0.0' },
      withLogging({ minLevel: 'log' }),
      withScenarios(),
      withBIEvents()
    ),
    destination,
    { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider },
    provideUwtEventInspector()
  ]
};
