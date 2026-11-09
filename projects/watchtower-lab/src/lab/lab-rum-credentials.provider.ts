import { Injectable, signal } from '@angular/core';
import {
  UwtRumBootstrap,
  UwtRumCredentialsProvider
} from '@absaoss-cps/ngx-ui-watchtower/rum';
import { labSentOnServer } from './lab-server-sends';

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
const telemetryOptions = (origin: string): Record<string, object> => ({
  http: {
    addXRayTraceIdHeader: [
      new RegExp('^' + origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/')
    ]
  },
  interaction: {
    enableMutationObserver: true,
    events: [{ event: 'click', cssLocator: 'button' }]
  },
  replay: { recordOptions: { blockSelector: '.lab-status, lab-wire-page' } }
});

/** How the mock broker was set when this page load started RUM. */
export interface LabBrokerStartup {
  mode: string;
  /** `null` for the library's default. */
  telemetries: readonly string[] | null;
}

/**
 * Asks the lab's mock broker for the app monitor config and credentials, as
 * the library's own example does: a broker that says RUM is off returns
 * `null`, and a failing broker throws — two different paths in the sink.
 */
@Injectable({ providedIn: 'root' })
export class LabRumCredentialsProvider implements UwtRumCredentialsProvider {
  /** This page's calls, so the broker can tell startup from a refresh. */
  private calls = 0;

  /** What this page load got, from the broker's lab-only echo. */
  readonly startup = signal<LabBrokerStartup | undefined>(undefined);

  async load(): Promise<UwtRumBootstrap | null> {
    const call = ++this.calls;
    if (labSentOnServer('GET /rum/init')) {
      return null;
    }
    const response = await fetch(`/rum/init?call=${call}`);
    const body = await response.json().catch(() => ({}));
    if (call === 1 && body.lab) {
      this.startup.set(body.lab);
    }
    if (!response.ok) {
      throw new Error(`RUM bootstrap failed: ${response.status}`);
    }
    // Only these: the lab's own echo goes no further.
    const { enabled, config, credentials } = body;
    if (!enabled) {
      return null;
    }
    // Left out by the broker, the library's default applies.
    const options = telemetryOptions(location.origin);
    const telemetries = (config.telemetries as string[] | undefined)?.map(
      (name) => (options[name] ? [name, options[name]] : name)
    );
    return {
      config: telemetries ? { ...config, telemetries } : config,
      credentials
    };
  }
}
