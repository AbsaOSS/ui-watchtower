import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideZoneChangeDetection
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay
} from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Route, Routes } from '@angular/router';
import {
  UWT_LOG_API_PROVIDER,
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  provideUwtTelemetryDestination,
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
import { LAB_OPTIONS, labRedaction, LabOptions } from '../lab/lab-options';
import { labChannel } from '../lab/lab-channel';
import { LabCustomSink } from '../lab/lab-custom.sink';
import { LabLogApiProvider } from '../lab/lab-log-api.provider';
import { LabRumCredentialsProvider } from '../lab/lab-rum-credentials.provider';

export { LAB_OPTIONS };

/** The side nav's groups, in order. */
export const SHELL_GROUPS = ['Library', 'Embedded apps', 'Tools'] as const;

export const SHELL_PAGES: {
  path: string;
  group: (typeof SHELL_GROUPS)[number];
  label: string;
  load: NonNullable<Route['loadComponent']>;
}[] = [
  {
    path: 'scenarios',
    group: 'Library',
    label: 'Scenarios',
    load: () => import('./pages/scenarios.page').then((m) => m.ScenariosPage)
  },
  {
    path: 'bi',
    group: 'Library',
    label: 'BI events',
    load: () => import('./pages/bi.page').then((m) => m.BIPage)
  },
  {
    path: 'logging',
    group: 'Library',
    label: 'Logging',
    load: () => import('./pages/logging.page').then((m) => m.LoggingPage)
  },
  {
    path: 'identity',
    group: 'Library',
    label: 'Identity',
    load: () => import('./pages/identity.page').then((m) => m.IdentityPage)
  },
  {
    path: 'privacy',
    group: 'Library',
    label: 'Privacy',
    load: () => import('./pages/privacy.page').then((m) => m.PrivacyPage)
  },
  {
    path: 'lifecycle',
    group: 'Library',
    label: 'Lifecycle',
    load: () => import('./pages/lifecycle.page').then((m) => m.LifecyclePage)
  },
  {
    path: 'iframe',
    group: 'Embedded apps',
    label: 'Iframe',
    load: () => import('./pages/fragment.page').then((m) => m.FragmentPage)
  },
  {
    path: 'web-fragment',
    group: 'Embedded apps',
    label: 'Web Fragment',
    load: () =>
      import('./pages/web-fragment.page').then((m) => m.WebFragmentPage)
  },
  {
    path: 'inspector',
    group: 'Tools',
    label: 'Event Inspector',
    load: () => import('./pages/inspector.page').then((m) => m.InspectorPage)
  },
  {
    path: 'wire',
    group: 'Tools',
    label: 'On the wire',
    load: () => import('./pages/wire.page').then((m) => m.WirePage)
  }
];

/**
 * Settings, at the foot of the nav, apart from the pages: it sets up the run
 * they all share, rather than being one of them. A page for each section.
 */
export const SHELL_SETTINGS = { path: 'settings', label: 'Settings' };

const routes: Routes = [
  ...SHELL_PAGES.map(({ path, label, load }) => ({
    path,
    title: `${label} · Watchtower Lab`,
    loadComponent: load
  })),
  {
    path: SHELL_SETTINGS.path,
    loadChildren: () =>
      import('./pages/settings.routes').then((m) => m.SETTINGS_ROUTES)
  },
  { path: '**', redirectTo: 'scenarios' }
];

/**
 * The shell: the realm with the real destination. RUM against the lab's
 * mock dataplane (or noop, or the lab's own sink), logs to its mock backend, the broadcast host for
 * the fragment, and the Event Inspector. A `?config=` overlay replaces the
 * lab's own settings, one by one.
 */
export const shellConfig = (options: LabOptions): ApplicationConfig => {
  const { identity, scenarios, logging, bi, inspector } = options.config;

  return {
    providers: [
      provideZoneChangeDetection({ eventCoalescing: true }),
      provideClientHydration(withEventReplay()),
      provideAnimations(),
      provideHttpClient(withFetch()),
      provideRouter(routes),
      { provide: LAB_OPTIONS, useValue: options },
      provideUwtTelemetry(
        {
          application: 'watchtower-lab',
          environment: 'lab',
          version: '1.0.0',
          ...identity
        },
        // The factory form, read once at startup in an injection context.
        withTelemetryEnabled(() => inject(LAB_OPTIONS).telemetry),
        withLogging({
          minLevel: 'log',
          levels: { noisy: 'warn' },
          mirrorErrorsToRum: true,
          ...logging
        }),
        withScenarios({ defaultTimeoutMs: 30_000, ...scenarios }),
        withBIEvents(bi),
        withRedaction({
          scanValuePatterns: ['email', 'creditCard', 'ssn', 'ipv4', 'phone'],
          ...labRedaction(options.config.redaction)
        })
      ),
      options.destination === 'noop'
        ? provideUwtTelemetrySink('noop')
        : options.destination === 'custom'
          ? provideUwtTelemetryDestination(LabCustomSink, {
              init: (sink) => sink.init()
            })
          : provideUwtTelemetryRumSink(),
      {
        provide: UWT_RUM_CREDENTIALS_PROVIDER,
        useExisting: LabRumCredentialsProvider
      },
      { provide: UWT_LOG_API_PROVIDER, useExisting: LabLogApiProvider },
      provideUwtTelemetryBroadcastHost(
        labChannel(options.channel === 'shared')
      ),
      provideUwtEventInspector({
        enabled: options.inspector !== 'off',
        ...(options.inspector === 'noshortcut' && { shortcuts: [] }),
        ...inspector
      })
    ]
  };
};
