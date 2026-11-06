import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  signal
} from '@angular/core';
import {
  UWT_BI_TELEMETRY_CONFIG,
  UWT_LOG_CONFIG,
  UWT_REDACT_CONFIG,
  UWT_SCENARIO_TELEMETRY_CONFIG,
  UWT_TELEMETRY_IDENTITY,
  uwtIsDebugEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import { UWT_EVENT_INSPECTOR_CONFIG } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import {
  CpsButtonComponent,
  CpsSwitchComponent,
  CpsTextareaComponent
} from 'cps-ui-kit';
import { parseJsonObject } from '../../lab/lab-json';
import { labSearch } from '../../lab/lab-options';
import { LAB_OPTIONS } from '../shell.config';

const DEBUG_FLAGS = ['debugScenario', 'debugBI', 'debugLogger'] as const;
type DebugFlag = (typeof DEBUG_FLAGS)[number];

@Component({
  selector: 'lab-settings-page',
  imports: [CpsButtonComponent, CpsSwitchComponent, CpsTextareaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Settings</h1>
      <p>
        The library's settings for this run: the lab's own, with a
        <code>?config=</code> overlay laid over them, read once at startup.
        Patterns are RegExp sources; the one value transform is
        <code>mask-order-ids</code>.
      </p>

      <div class="lab-card">
        <h2>Overlay</h2>
        <cps-textarea
          label="?config= (JSON)"
          placeholder='{ "scenarios": { "emitLifecycleEvents": true } }'
          [rows]="8"
          [value]="draft()"
          [error]="error()"
          (valueChanged)="draft.set($event)" />
        <div class="lab-actions">
          <cps-button label="Apply and reload" (clicked)="apply()" />
          <cps-button
            label="Back to the lab's settings"
            type="outlined"
            (clicked)="apply('')" />
        </div>
      </div>

      <div class="lab-card">
        <h2>Debug flags</h2>
        <p>
          Console lines for what is sent. The library reads them on every event,
          so they apply without a reload.
        </p>
        <div class="lab-switches">
          @for (flag of flags; track flag) {
            <cps-switch
              [label]="flag"
              [value]="debug()[flag]"
              (valueChanged)="setDebug(flag, $event)" />
          }
        </div>
      </div>

      <div class="lab-card">
        <h2>In effect</h2>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Settings in effect"
          >{{ effective }}</pre>
      </div>
    </section>
  `
})
export class SettingsPage {
  protected readonly flags = DEBUG_FLAGS;
  protected readonly error = signal('');

  private readonly window = inject(DOCUMENT).defaultView!;
  private readonly options = inject(LAB_OPTIONS);

  protected readonly draft = signal(
    Object.keys(this.options.config).length
      ? JSON.stringify(this.options.config, null, 2)
      : ''
  );

  protected readonly debug = signal(this.readDebug());

  /** What the library was given, read back from its tokens. */
  protected readonly effective = JSON.stringify(
    {
      identity: inject(UWT_TELEMETRY_IDENTITY),
      scenarios: inject(UWT_SCENARIO_TELEMETRY_CONFIG),
      logging: inject(UWT_LOG_CONFIG),
      bi: inject(UWT_BI_TELEMETRY_CONFIG),
      redaction: inject(UWT_REDACT_CONFIG),
      inspector: inject(UWT_EVENT_INSPECTOR_CONFIG)
    },
    readable,
    2
  );

  /**
   * Reloads with `json` as the overlay — none for the lab's own settings —
   * keeping the other startup options, which in-app links drop.
   */
  protected apply(json = this.draft().trim()): void {
    const config = json ? parseJsonObject(json) : {};
    if (!config) {
      this.error.set('Not a JSON object.');
      return;
    }
    this.window.location.assign(
      `${this.window.location.pathname}${labSearch({ ...this.options, config })}`
    );
  }

  protected setDebug(flag: DebugFlag, on: boolean): void {
    try {
      if (on) {
        this.window.localStorage.setItem(flag, 'true');
      } else {
        this.window.localStorage.removeItem(flag);
      }
    } catch {
      // Storage blocked: the flags stay as they were.
    }
    this.debug.set(this.readDebug());
  }

  /** As the library reads them: a list of logger names is not "on". */
  private readDebug(): Record<DebugFlag, boolean> {
    return {
      debugScenario: uwtIsDebugEnabled('debugScenario'),
      debugBI: uwtIsDebugEnabled('debugBI'),
      debugLogger: uwtIsDebugEnabled('debugLogger')
    };
  }
}

/** RegExps and functions, readable in JSON. */
function readable(_key: string, value: unknown): unknown {
  if (value instanceof RegExp) {
    return String(value);
  }
  return typeof value === 'function'
    ? `ƒ ${value.name || '(anonymous)'}`
    : value;
}
