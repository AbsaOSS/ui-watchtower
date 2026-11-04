import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService,
  UwtTelemetryMonitor,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  UwtEventInspectorService,
  UwtInspectorDock
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { CpsButtonComponent, CpsSwitchComponent } from 'cps-ui-kit';
import { LabLayout } from '../../lab/lab-layout.service';
import { LAB_OPTIONS } from '../shell.config';

const DOCKS: { dock: UwtInspectorDock; label: string }[] = [
  { dock: 'dialog', label: 'Dialog' },
  { dock: 'window', label: 'Separate window' },
  { dock: 'left', label: 'Left pane' },
  { dock: 'right', label: 'Right pane' },
  { dock: 'bottom', label: 'Bottom pane' }
];

@Component({
  selector: 'lab-inspector-page',
  imports: [CpsButtonComponent, CpsSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Event Inspector</h1>
      <p>
        {{
          options.inspector === 'off'
            ? 'Disabled with ?inspector=off.'
            : options.inspector === 'noshortcut'
              ? 'No keyboard shortcut (?inspector=noshortcut): open it from here.'
              : 'Shortcut: ' + shortcuts + '.'
        }}
      </p>

      <div class="lab-card">
        <h2>Where it opens</h2>
        <div class="lab-actions">
          @for (option of docks; track option.dock) {
            <cps-button
              [label]="option.label"
              type="outlined"
              (clicked)="inspector.setDock(option.dock)" />
          }
          <cps-button
            label="Close"
            type="borderless"
            (clicked)="inspector.close()" />
        </div>
        <cps-switch
          label="Keep the fixed header and status bar beside a pane (--uwt-inspector-inset-*)"
          [value]="layout.insets()"
          (valueChanged)="layout.insets.set($event)" />
      </div>

      <div class="lab-card">
        <h2>Events</h2>
        <div class="lab-actions">
          <cps-button label="One of each kind" (clicked)="eachKind()" />
          <cps-button
            label="A burst of 600 BI events"
            type="outlined"
            (clicked)="burst()" />
        </div>
      </div>

      <div class="lab-card">
        <h2>Synthetic events</h2>
        <p>
          Published straight to the telemetry monitor, so only the Event
          Inspector sees them — shapes the library's own services never produce.
        </p>
        <div class="lab-actions">
          <cps-button
            label="A 300,000-character payload"
            type="outlined"
            (clicked)="huge()" />
          <cps-button label="Odd shapes" type="outlined" (clicked)="odd()" />
          <cps-button
            label="An unknown event type"
            type="outlined"
            (clicked)="unknown()" />
        </div>
      </div>
    </section>
  `
})
export class InspectorPage {
  protected readonly inspector = inject(UwtEventInspectorService);
  protected readonly layout = inject(LabLayout);
  protected readonly options = inject(LAB_OPTIONS);
  protected readonly docks = DOCKS;
  protected readonly shortcuts = UWT_DEFAULT_INSPECTOR_SHORTCUTS.map(
    (s) => s.label
  ).join(' or ');

  private readonly bi = inject(UwtBITelemetryService);
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly logger = inject(UwtLoggerService).getLogger('lab');
  private readonly monitor = inject(UwtTelemetryMonitor);

  protected eachKind(): void {
    this.bi.track('lab_button_clicked', {
      button: 'each-kind',
      at: Date.now()
    });
    const scenario = this.scenarios.start({ name: 'lab-happy-path' });
    scenario.step('fetch');
    scenario.complete();
    this.logger.warn('A warning, from the Event Inspector page');
    this.logger.error('An error, mirrored to RUM', {
      error: new Error('Lab error')
    });
  }

  protected burst(): void {
    for (let n = 0; n < 600; n++) {
      this.bi.track('lab_burst', { n });
    }
  }

  protected huge(): void {
    this.publish({
      kind: 'bi',
      eventType: 'com.uwt.bi',
      payload: { eventName: 'lab_huge_payload', blob: 'x'.repeat(300_000) }
    });
  }

  protected odd(): void {
    this.publish({
      kind: 'bi',
      eventType: 'com.uwt.bi',
      payload: {
        eventName: 'lab_odd_shapes',
        unicode: 'Zürich · 東京 · 🚀',
        nothing: null,
        nested: { deeper: { deepest: [1, [2, [3, { four: 4 }]]] } },
        list: [{ name: 'a' }, { name: 'b' }],
        empty: {}
      }
    });
  }

  protected unknown(): void {
    this.publish({
      kind: 'unknown',
      eventType: 'com.example.custom',
      payload: { what: 'an event type the library does not emit' }
    });
  }

  private publish(
    event: Pick<UwtTelemetryPublishInput, 'kind'> & {
      eventType: string;
      payload: object;
    }
  ): void {
    this.monitor.publish({
      ...event,
      destination: 'sink',
      origin: { forwarded: false }
    } as UwtTelemetryPublishInput);
  }
}
