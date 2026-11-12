import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import {
  UwtLoggerService,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent, CpsTextareaComponent } from 'cps-ui-kit';
import { LabResultsComponent } from '../../lab/lab-results.component';
import { parseJsonObject } from '../../lab/lab-json';

@Component({
  selector: 'lab-logging-page',
  imports: [CpsButtonComponent, CpsTextareaComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>Logging</h1>
      <p>
        Records go to the lab's mock log backend. Errors are also mirrored to
        RUM (mirrorErrorsToRum). The <code>noisy</code> logger only writes
        warnings and up.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>The <code>lab</code> logger</h2>
          <div class="lab-actions">
            <cps-button label="log" (clicked)="lab.log('A lab log line')" />
            <cps-button
              label="warn"
              type="outlined"
              (clicked)="lab.warn('A lab warning')" />
            <cps-button
              label="error, with an Error"
              type="outlined"
              (clicked)="error()" />
          </div>
        </div>
        <div class="lab-card">
          <h2>The <code>noisy</code> logger (warn and up)</h2>
          <div class="lab-actions">
            <cps-button
              label="log (dropped)"
              type="outlined"
              (clicked)="noisy.log('Not written')" />
            <cps-button
              label="warn (written)"
              (clicked)="noisy.warn('A noisy warning')" />
          </div>
        </div>
        <div class="lab-card">
          <h2>Tied to a journey</h2>
          <p>
            A warning whose correlationId is a scenario's id: the filter below
            is set to find it.
          </p>
          <div class="lab-actions">
            <cps-button
              label="Log inside a scenario"
              (clicked)="correlated()" />
          </div>
        </div>
        <div class="lab-card">
          <h2>Reading back</h2>
          <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
          <cps-textarea
            ngSkipHydration
            label="Query filter (JSON)"
            placeholder='{ "logger": "lab", "minLevel": "warn", "limit": 20 }'
            width="30rem"
            [rows]="3"
            [value]="filter()"
            [error]="filterError()"
            (valueChanged)="filter.set($event)" />
          <div class="lab-actions">
            <cps-button label="Run query" (clicked)="runQuery()" />
          </div>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ readout() || 'No query yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class LoggingPage {
  protected readonly readout = signal('');
  protected readonly filter = signal('{ "logger": "lab", "limit": 20 }');
  protected readonly filterError = signal('');

  private readonly logger = inject(UwtLoggerService);
  protected readonly lab = this.logger.getLogger('lab');
  protected readonly noisy = this.logger.getLogger('noisy');
  private readonly scenarios = inject(UwtScenarioTelemetryService);

  protected error(): void {
    this.lab.error('Saving the order failed', {
      error: new Error('Connection reset'),
      context: 'checkout',
      metadata: { orderId: 'A-1001' }
    });
  }

  protected correlated(): void {
    const scenario = this.scenarios.start({ name: 'lab-correlated' });
    this.lab.warn('Inside a journey', { correlationId: scenario.id });
    scenario.complete();
    this.filter.set(JSON.stringify({ correlationId: scenario.id }));
  }

  /** Any filter the log provider takes: logger, correlationId, minLevel… */
  protected async runQuery(): Promise<void> {
    const filter = parseJsonObject(this.filter().trim() || '{}');
    this.filterError.set(filter ? '' : 'Not a JSON object.');
    if (filter) {
      const records = await this.logger.query(filter);
      this.readout.set(JSON.stringify(records, null, 2));
    }
  }
}
