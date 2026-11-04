import { Injectable } from '@angular/core';
import {
  UwtRumBootstrap,
  UwtRumCredentialsProvider
} from '@absaoss-cps/ngx-ui-watchtower/rum';

/** The page's own origin, as the start of a URL. */
const sameOrigin = new RegExp(
  '^' + location.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'
);

/**
 * Options for the RUM telemetries the broker names, which its JSON can't
 * carry:
 *
 * - `http` as in the library's default.
 * - `interaction` recording every button click — it records nothing without
 *   a list of elements.
 * - `replay` leaving out the status bar and "On the wire": they show what
 *   reached the dataplane, so each replay batch would change them, and be
 *   recorded, forever.
 */
const TELEMETRY_OPTIONS: Record<string, object> = {
  http: { addXRayTraceIdHeader: [sameOrigin] },
  interaction: {
    enableMutationObserver: true,
    events: [{ event: 'click', cssLocator: 'button' }]
  },
  replay: { recordOptions: { blockSelector: '.lab-status, lab-wire-page' } }
};

/**
 * Asks the lab's mock broker for the app monitor config and credentials, as
 * the library's own example does: a broker that says RUM is off returns
 * `null`, and a failing broker throws — two different paths in the sink.
 */
@Injectable({ providedIn: 'root' })
export class LabRumCredentialsProvider implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    const response = await fetch('/rum/init');
    if (!response.ok) {
      throw new Error(`RUM bootstrap failed: ${response.status}`);
    }
    const { enabled, config, credentials } = await response.json();
    if (!enabled) {
      return null;
    }
    // Left out by the broker, the library's default applies.
    const telemetries = (config.telemetries as string[] | undefined)?.map(
      (name) =>
        TELEMETRY_OPTIONS[name] ? [name, TELEMETRY_OPTIONS[name]] : name
    );
    return {
      config: telemetries ? { ...config, telemetries } : config,
      credentials
    };
  }
}
