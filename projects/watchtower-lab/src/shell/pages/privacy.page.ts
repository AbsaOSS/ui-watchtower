import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import {
  UWT_REDACT_CONFIG,
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService,
  uwtNormalizeError,
  uwtRedactMetadata,
  uwtScrubString
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent, CpsTextareaComponent } from 'cps-ui-kit';
import { LabResultsComponent } from '../../lab/lab-results.component';

/** Values that must never leave the browser as they are. */
const PERSONAL = {
  email: 'anna.smith@example.com',
  note: 'card 4111 1111 1111 1111, phone +27 82 555 0123, SSN 123-45-6789',
  ip: '10.1.2.3',
  password: 'hunter2',
  authToken: 'eyJhbGciOiJIUzI1NiJ9.lab'
};

@Component({
  selector: 'lab-privacy-page',
  imports: [CpsButtonComponent, CpsTextareaComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>Privacy</h1>
      <p>
        Each button sends the values below; with key patterns and
        scanValuePatterns on, none of them should appear as they are — not in
        the Event Inspector, not on the wire.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>Personal values</h2>
          <pre class="lab-readout">{{ personal }}</pre>
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

        <div class="lab-card">
          <h2>Errors of any shape</h2>
          <p>
            Logged as errors: a string is scrubbed, an object is reduced to its
            type, and an HTTP error keeps its status but not its URL's query.
          </p>
          <div class="lab-actions">
            <cps-button
              label="An error as a string"
              (clicked)="errorAs('string')" />
            <cps-button
              label="An error as a plain object"
              type="outlined"
              (clicked)="errorAs('object')" />
            <cps-button
              label="An HttpErrorResponse"
              type="outlined"
              (clicked)="errorAs('http')" />
          </div>
        </div>

        <div class="lab-card">
          <h2>Scrub anything</h2>
          <p>
            What the library makes of any text, with this app's redaction
            settings: as a string, as metadata, and as an error's message.
          </p>
          <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
          <cps-textarea
            ngSkipHydration
            label="Text to scrub"
            width="30rem"
            [rows]="3"
            [value]="text()"
            (valueChanged)="text.set($event)" />
          <pre class="lab-readout lab-scrubbed">{{ scrubbed() }}</pre>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ sent() || 'Nothing sent yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class PrivacyPage {
  protected readonly personal = JSON.stringify(PERSONAL, null, 2);
  protected readonly sent = signal('');

  private readonly biTelemetry = inject(UwtBITelemetryService);
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly logger = inject(UwtLoggerService).getLogger('privacy');
  private readonly redaction = inject(UWT_REDACT_CONFIG);

  protected readonly text = signal(
    `Mail ${PERSONAL.email} from https://shop.example/orders?token=abc`
  );

  protected readonly scrubbed = computed(() => {
    const text = this.text();
    return JSON.stringify(
      {
        uwtScrubString: uwtScrubString(text, this.redaction),
        uwtRedactMetadata: uwtRedactMetadata(
          { note: text, password: text },
          this.redaction
        ),
        uwtNormalizeError: uwtNormalizeError(new Error(text), {
          ...this.redaction,
          includeStack: false
        })
      },
      null,
      2
    );
  });

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

  protected errorAs(shape: 'string' | 'object' | 'http'): void {
    const error = {
      string: `Lookup failed for ${PERSONAL.email}`,
      object: { code: 42, customer: PERSONAL.email },
      http: new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
        url: `https://shop.example/api/customers?email=${PERSONAL.email}`
      })
    }[shape];
    this.logger.error(`The ${shape} error`, { error });
    this.sent.set(`Logged the ${shape} error.`);
  }
}
