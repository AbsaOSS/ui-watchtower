import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  signal
} from '@angular/core';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent, CpsSwitchComponent } from 'cps-ui-kit';
import { LabRumEvent, LabWire } from '../../lab/lab-wire.service';

@Component({
  selector: 'lab-wire-page',
  imports: [CpsButtonComponent, CpsSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>On the wire</h1>
      <p>
        What the lab's mock backend actually received — the other side of what
        the app, and the Event Inspector, say was sent. Newest first. The mock
        RUM broker is set up in Settings.
      </p>

      <div class="lab-card">
        <h2>The mock backend</h2>
        <div class="lab-actions">
          <cps-button label="Flush now" (clicked)="flush()" />
          <cps-button
            label="Reset the mock backend"
            type="outlined"
            (clicked)="reset()" />
          <span class="lab-note" role="status">{{ status() }}</span>
        </div>
      </div>

      <div class="lab-card">
        <div class="lab-card__header">
          <h2>RUM events ({{ rum().length }})</h2>
          <cps-switch
            label="Library events only"
            [value]="libraryOnly()"
            (valueChanged)="libraryOnly.set($event)" />
        </div>
        <div
          class="lab-scroll"
          tabindex="0"
          role="region"
          aria-label="RUM events received">
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
      </div>

      <div class="lab-card">
        <h2>Log records ({{ logs().length }})</h2>
        <div
          class="lab-scroll"
          tabindex="0"
          role="region"
          aria-label="Log records received">
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
      </div>
    </section>
  `
})
export class WirePage {
  protected readonly wire = inject(LabWire);
  protected readonly libraryOnly = signal(true);
  protected readonly status = signal('');

  private readonly sink = inject(UwtTelemetrySink);
  private readonly window = inject(DOCUMENT).defaultView!;

  protected readonly rum = computed(() =>
    this.wire
      .rum()
      .filter((e) => !this.libraryOnly() || e.type.startsWith('com.uwt.'))
      .slice()
      .reverse()
  );

  protected readonly logs = computed(() => this.wire.logs().slice().reverse());

  protected flush(): void {
    this.sink.flush();
    this.status.set('Flushed: what the sink held is on its way.');
  }

  /** Empties the mock backend, once confirmed: there's no undoing it. */
  protected async reset(): Promise<void> {
    if (
      !this.window.confirm(
        'Empty the mock backend? Everything it received is lost.'
      )
    ) {
      return;
    }
    await this.wire.reset();
    this.status.set('Reset: the mock backend is empty.');
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
