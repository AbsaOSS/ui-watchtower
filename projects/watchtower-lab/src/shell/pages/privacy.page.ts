import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import {
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';

/** Values that must never leave the browser as they are. */
const PERSONAL = {
  email: 'anna.smith@example.com',
  note: 'card 4111 1111 1111 1111, phone +27 82 555 0123',
  ip: '10.1.2.3',
  password: 'hunter2',
  authToken: 'eyJhbGciOiJIUzI1NiJ9.lab'
};

@Component({
  selector: 'lab-privacy-page',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Privacy</h1>
      <p>
        Each button sends the values below; with key patterns and
        scanValuePatterns on, none of them should appear as they are — not in
        the Event Inspector, not on the wire.
      </p>
      <pre class="lab-readout">{{ personal }}</pre>
      <div class="lab-card">
        <div class="lab-actions">
          <cps-button label="As BI metadata" (clicked)="bi()" />
          <cps-button
            label="In a log message"
            type="outlined"
            (clicked)="log()" />
          <cps-button
            label="In a failing scenario"
            type="outlined"
            (clicked)="scenario()" />
        </div>
      </div>
      <p>{{ sent() }}</p>
    </section>
  `
})
export class PrivacyPage {
  protected readonly personal = JSON.stringify(PERSONAL, null, 2);
  protected readonly sent = signal('');

  private readonly biTelemetry = inject(UwtBITelemetryService);
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly logger = inject(UwtLoggerService).getLogger('privacy');

  protected bi(): void {
    this.biTelemetry.track('lab_privacy_checked', PERSONAL);
    this.sent.set('Sent as lab_privacy_checked.');
  }

  protected log(): void {
    this.logger.warn(`Customer ${PERSONAL.email} paid with ${PERSONAL.note}`, {
      metadata: { ip: PERSONAL.ip, password: PERSONAL.password }
    });
    this.sent.set('Sent as a warning from the privacy logger.');
  }

  protected scenario(): void {
    this.scenarios
      .start({ name: 'lab-privacy', metadata: { email: PERSONAL.email } })
      .fail({ error: new Error(`Lookup failed for ${PERSONAL.email}`) });
    this.sent.set('Sent as the failed lab-privacy scenario.');
  }
}
