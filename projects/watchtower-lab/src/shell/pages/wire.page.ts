import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import {
  CpsButtonComponent,
  CpsSelectComponent,
  CpsSwitchComponent,
  CpsTextareaComponent
} from 'cps-ui-kit';
import {
  LAB_TELEMETRIES,
  LabBrokerMode,
  LabRumEvent,
  LabTelemetry,
  LabWire
} from '../../lab/lab-wire.service';

const BROKER_MODES: { label: string; value: LabBrokerMode }[] = [
  { label: 'ok — RUM records normally', value: 'ok' },
  { label: 'null — RUM off for the page', value: 'null' },
  { label: 'fail — broker error, the app carries on', value: 'fail' },
  {
    label: 'short-expiry — credentials refresh within seconds',
    value: 'short-expiry'
  },
  { label: 'flaky — fails twice, then answers', value: 'flaky' },
  {
    label: 'invalid — a pattern as a string: RUM not started',
    value: 'invalid'
  },
  {
    label: 'null-on-refresh — RUM off at the first refresh',
    value: 'null-on-refresh'
  },
  {
    label: 'no-credentials-on-refresh — a refresh without credentials',
    value: 'no-credentials-on-refresh'
  }
];

@Component({
  selector: 'lab-wire-page',
  imports: [
    CpsButtonComponent,
    CpsSelectComponent,
    CpsSwitchComponent,
    CpsTextareaComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>On the wire</h1>
      <p>
        What the lab's mock backend actually received — the other side of what
        the app, and the Event Inspector, say was sent. Newest first.
      </p>

      <div class="lab-card">
        <h2>Mock RUM broker</h2>
        <div class="lab-actions">
          <cps-select
            label="Answer the next /rum/init with"
            [options]="modes"
            [returnObject]="false"
            [value]="wire.brokerMode()"
            width="26rem"
            (valueChanged)="wire.setBrokerMode($event)" />
        </div>
        <p>
          RUM's own telemetry: the library's default is errors, performance and
          same-origin HTTP. With none, RUM records only page views, the session
          start and the library's events.
        </p>
        <div class="lab-actions">
          <cps-switch
            label="The library's default"
            [value]="wire.telemetries() === null"
            (valueChanged)="useDefault($event)" />
          @if (wire.telemetries(); as chosen) {
            <cps-select
              label="Telemetries"
              placeholder="None"
              [options]="telemetryOptions"
              [returnObject]="false"
              [multiple]="true"
              [selectAll]="true"
              [chips]="true"
              [value]="chosen"
              width="26rem"
              (valueChanged)="wire.setTelemetries($event)" />
          }
        </div>
        <cps-textarea
          label="Laid over the app monitor config (JSON)"
          placeholder='{ "sessionSampleRate": 0 }'
          width="26rem"
          [rows]="3"
          [value]="brokerConfigDraft()"
          [error]="brokerConfigError()"
          (valueChanged)="brokerConfigDraft.set($event)" />
        <div class="lab-actions">
          <cps-button
            label="Set the overlay"
            type="outlined"
            (clicked)="setBrokerConfig()" />
          <cps-button
            label="Reload to apply"
            type="outlined"
            (clicked)="reload()" />
        </div>
      </div>

      <div class="lab-card">
        <div class="lab-actions">
          <cps-button label="Flush now" (clicked)="sink.flush()" />
          <cps-button
            label="Reset the mock backend"
            type="outlined"
            (clicked)="wire.reset()" />
          <cps-switch
            label="Library events only"
            [value]="libraryOnly()"
            (valueChanged)="libraryOnly.set($event)" />
        </div>
      </div>

      <div class="lab-card">
        <h2>RUM events ({{ rum().length }})</h2>
        <table class="lab-table">
          <thead>
            <tr>
              <th>Received</th>
              <th>Type</th>
              <th>Session · user</th>
              <th>signedIn</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            @for (event of rum(); track event.id) {
              <tr>
                <td>{{ event.receivedAt.slice(11, 19) }}</td>
                <td>
                  <code>{{ event.type }}</code>
                </td>
                <td>
                  {{ short(event.user.sessionId) }} ·
                  {{ short(event.user.userId) }}
                </td>
                <td>{{ event.metadata['signedIn'] ?? '' }}</td>
                <td>
                  <details>
                    <summary>{{ summary(event) }}</summary>
                    <pre class="lab-readout">{{ json(event) }}</pre>
                  </details>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="lab-card">
        <h2>Log records ({{ logs().length }})</h2>
        <table class="lab-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Application · logger</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            @for (record of logs(); track $index) {
              <tr>
                <td>{{ record.timestamp.slice(11, 19) }}</td>
                <td>{{ record.level }}</td>
                <td>{{ record.application }} · {{ record.logger }}</td>
                <td>{{ record.message }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class WirePage {
  protected readonly wire = inject(LabWire);
  protected readonly sink = inject(UwtTelemetrySink);
  protected readonly modes = BROKER_MODES;
  protected readonly libraryOnly = signal(true);
  protected readonly brokerConfigDraft = signal(
    JSON.stringify(this.wire.brokerConfig())
  );

  protected readonly brokerConfigError = signal('');

  protected readonly telemetryOptions = LAB_TELEMETRIES.map((t) => ({
    label: t,
    value: t
  }));

  protected readonly rum = computed(() =>
    this.wire
      .rum()
      .filter((e) => !this.libraryOnly() || e.type.startsWith('com.uwt.'))
      .slice()
      .reverse()
  );

  protected readonly logs = computed(() => this.wire.logs().slice().reverse());

  protected async setBrokerConfig(): Promise<void> {
    let config: unknown;
    try {
      config = JSON.parse(this.brokerConfigDraft().trim() || '{}');
    } catch {
      config = undefined;
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      this.brokerConfigError.set('Not a JSON object.');
      return;
    }
    this.brokerConfigError.set('');
    await this.wire.setBrokerConfig(config as Record<string, unknown>);
  }

  protected reload(): void {
    location.reload();
  }

  /** Back to the default, or a list to edit that starts as the default. */
  protected useDefault(useDefault: boolean): void {
    const defaults: LabTelemetry[] = ['errors', 'performance', 'http'];
    this.wire.setTelemetries(useDefault ? null : defaults);
  }

  protected short(id?: string): string {
    return id ? id.slice(0, 8) : '—';
  }

  protected summary(event: LabRumEvent): string {
    const d = event.details;
    return String(d.eventName ?? d.scenarioName ?? d.message ?? d.name ?? '…');
  }

  protected json(event: LabRumEvent): string {
    return JSON.stringify(
      { metadata: event.metadata, details: event.details },
      null,
      2
    );
  }
}
