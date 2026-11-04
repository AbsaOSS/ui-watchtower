import {
  ApplicationConfig,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  provideUwtTelemetry,
  provideUwtTelemetrySink,
  withLogging
} from '@absaoss-cps/ngx-ui-watchtower';

/**
 * The fragment: zoneless, and forwarding everything — events, log records,
 * identity — over the broadcast channel to the shell, which records it.
 */
export const fragmentConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimations(),
    provideUwtTelemetry(
      { application: 'lab-fragment', environment: 'lab', version: '1.0.0' },
      withLogging({ minLevel: 'log', mirrorErrorsToRum: true })
    ),
    provideUwtTelemetrySink('broadcast')
  ]
};
