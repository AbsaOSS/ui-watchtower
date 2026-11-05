import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  InjectionToken,
  provideZoneChangeDetection
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay
} from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Routes } from '@angular/router';
import {
  UWT_LOG_API_PROVIDER,
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  provideUwtTelemetrySink,
  withBIEvents,
  withLogging,
  withRedaction,
  withScenarios,
  withTelemetryEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_RUM_CREDENTIALS_PROVIDER,
  provideUwtTelemetryRumSink
} from '@absaoss-cps/ngx-ui-watchtower/rum';
import { provideUwtEventInspector } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { LabOptions } from '../lab/lab-options';
import { LAB_CHANNEL } from '../lab/lab-channel';
import { LabLogApiProvider } from '../lab/lab-log-api.provider';
import { LabRumCredentialsProvider } from '../lab/lab-rum-credentials.provider';

export const LAB_OPTIONS = new InjectionToken<LabOptions>('LAB_OPTIONS');

export const SHELL_PAGES = [
  {
    path: 'scenarios',
    label: 'Scenarios',
    load: () => import('./pages/scenarios.page').then((m) => m.ScenariosPage)
  },
  {
    path: 'bi',
    label: 'BI events',
    load: () => import('./pages/bi.page').then((m) => m.BIPage)
  },
  {
    path: 'logging',
    label: 'Logging',
    load: () => import('./pages/logging.page').then((m) => m.LoggingPage)
  },
  {
    path: 'identity',
    label: 'Identity',
    load: () => import('./pages/identity.page').then((m) => m.IdentityPage)
  },
  {
    path: 'privacy',
    label: 'Privacy',
    load: () => import('./pages/privacy.page').then((m) => m.PrivacyPage)
  },
  {
    path: 'lifecycle',
    label: 'Lifecycle',
    load: () => import('./pages/lifecycle.page').then((m) => m.LifecyclePage)
  },
  {
    path: 'fragment',
    label: 'Fragment (iframe)',
    load: () => import('./pages/fragment.page').then((m) => m.FragmentPage)
  },
  {
    path: 'web-fragment',
    label: 'Web Fragment',
    load: () =>
      import('./pages/web-fragment.page').then((m) => m.WebFragmentPage)
  },
  {
    path: 'inspector',
    label: 'Event Inspector',
    load: () => import('./pages/inspector.page').then((m) => m.InspectorPage)
  },
  {
    path: 'wire',
    label: 'On the wire',
    load: () => import('./pages/wire.page').then((m) => m.WirePage)
  }
];

const routes: Routes = [
  ...SHELL_PAGES.map(({ path, label, load }) => ({
    path,
    title: `${label} · Watchtower Lab`,
    loadComponent: load
  })),
  { path: '**', redirectTo: 'scenarios' }
];

/**
 * The shell: the realm with the real destination. RUM against the lab's
 * mock dataplane (or noop), logs to its mock backend, the broadcast host for
 * the fragment, and the Event Inspector.
 */
export const shellConfig = (options: LabOptions): ApplicationConfig => ({
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideClientHydration(withEventReplay()),
    provideAnimations(),
    provideHttpClient(withFetch()),
    provideRouter(routes),
    { provide: LAB_OPTIONS, useValue: options },
    provideUwtTelemetry(
      { application: 'watchtower-lab', environment: 'lab', version: '1.0.0' },
      withTelemetryEnabled(options.telemetry),
      withLogging({
        minLevel: 'log',
        levels: { noisy: 'warn' },
        mirrorErrorsToRum: true
      }),
      withScenarios({ defaultTimeoutMs: 30_000 }),
      withBIEvents(),
      withRedaction({
        scanValuePatterns: ['email', 'creditCard', 'ssn', 'ipv4', 'phone']
      })
    ),
    options.destination === 'noop'
      ? provideUwtTelemetrySink('noop')
      : provideUwtTelemetryRumSink(),
    {
      provide: UWT_RUM_CREDENTIALS_PROVIDER,
      useExisting: LabRumCredentialsProvider
    },
    { provide: UWT_LOG_API_PROVIDER, useExisting: LabLogApiProvider },
    provideUwtTelemetryBroadcastHost(LAB_CHANNEL),
    provideUwtEventInspector({
      enabled: options.inspector !== 'off',
      ...(options.inspector === 'noshortcut' && { shortcuts: [] })
    })
  ]
});
