import {
  ApplicationConfig,
  provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  UWT_BROADCAST_CHANNEL,
  UWT_DEFAULT_BROADCAST_CHANNEL,
  provideUwtTelemetry,
  provideUwtTelemetrySink,
  withLogging
} from '@absaoss-cps/ngx-ui-watchtower';

declare global {
  interface Window {
    __uwtTelemetryChannel?: string;
  }
}

/**
 * The shell's channel for this tab, published on the top-level window — as
 * a plain iframe or a Web Fragment, the fragment shares the shell's origin,
 * so `window.top` reaches it. On its own, the default channel.
 */
function shellChannel(): string {
  try {
    return window.top?.__uwtTelemetryChannel ?? UWT_DEFAULT_BROADCAST_CHANNEL;
  } catch {
    return UWT_DEFAULT_BROADCAST_CHANNEL;
  }
}

/**
 * The fragment: zoneless, and forwarding everything — events, log records,
 * identity — over the shell's channel, to the shell, which records it.
 */
export const fragmentConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimations(),
    provideUwtTelemetry(
      { application: 'lab-fragment', environment: 'lab', version: '1.0.0' },
      withLogging({ minLevel: 'log', mirrorErrorsToRum: true })
    ),
    provideUwtTelemetrySink('broadcast'),
    { provide: UWT_BROADCAST_CHANNEL, useFactory: shellChannel }
  ]
};
