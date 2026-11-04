import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer
} from '@angular/core';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig
} from '../uwt-inspector.models/uwt-inspector.models';
import { UWT_DEFAULT_INSPECTOR_CONFIG } from '../uwt-inspector-store/uwt-inspector-store';
import { UWT_DEFAULT_INSPECTOR_SHORTCUTS } from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import { UwtEventInspectorService } from '../uwt-event-inspector.service/uwt-event-inspector.service';

/**
 * Adds the Event Inspector: an in-app window showing, live,
 * every BI, scenario and log event this app hands to its destinations.
 *
 * Opens with Shift+E+I by default — hold Shift, press E, then I — in every
 * environment. Needs cps-ui-kit set up in the app, as for any cps-ui-kit
 * dialog.
 *
 * @example
 * ```typescript
 * import { provideUwtEventInspector } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
 *
 * providers: [
 *   provideUwtTelemetry({ application: 'my-app', environment, version }),
 *   provideUwtEventInspector()
 * ]
 *
 * // Or a different key, or access limited to some users:
 * provideUwtEventInspector({
 *   shortcuts: [{ code: 'KeyD', ctrl: true, alt: true, shift: true }],
 *   enabled: () => inject(AuthService).isSupportStaff()
 * })
 * ```
 *
 * @param config overrides merged over the defaults
 * @returns providers for the popup and its shortcut
 *
 * @group Utils
 */
export function provideUwtEventInspector(
  config: Partial<UwtEventInspectorConfig> = {}
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: UWT_EVENT_INSPECTOR_CONFIG,
      useValue: {
        ...UWT_DEFAULT_INSPECTOR_CONFIG,
        shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS,
        ...config
      }
    },
    provideAppInitializer(() => {
      inject(UwtEventInspectorService).install();
    })
  ]);
}
