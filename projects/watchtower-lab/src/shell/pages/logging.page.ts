import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { UwtLoggerService } from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';

@Component({
  selector: 'lab-logging-page',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Logging</h1>
      <p>
        Records go to the lab's mock log backend. Errors are also mirrored to
        RUM (mirrorErrorsToRum). The <code>noisy</code> logger only writes
        warnings and up.
      </p>
      <div class="lab-card">
        <h2>The <code>lab</code> logger</h2>
        <div class="lab-actions">
          <cps-button
            label="log"
            type="outlined"
            (clicked)="lab.log('A lab log line')" />
          <cps-button
            label="warn"
            type="outlined"
            (clicked)="lab.warn('A lab warning')" />
          <cps-button label="error, with an Error" (clicked)="error()" />
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
            label="warn"
            type="outlined"
            (clicked)="noisy.warn('A noisy warning')" />
        </div>
      </div>
      <div class="lab-card">
        <h2>Reading back</h2>
        <div class="lab-actions">
          <cps-button
            label="query({ logger: 'lab' })"
            type="outlined"
            (clicked)="query()" />
        </div>
      </div>
      <pre class="lab-readout">{{ readout() || 'No query yet.' }}</pre>
    </section>
  `
})
export class LoggingPage {
  protected readonly readout = signal('');

  private readonly logger = inject(UwtLoggerService);
  protected readonly lab = this.logger.getLogger('lab');
  protected readonly noisy = this.logger.getLogger('noisy');

  protected error(): void {
    this.lab.error('Saving the order failed', {
      error: new Error('Connection reset'),
      context: 'checkout',
      metadata: { orderId: 'A-1001' }
    });
  }

  protected async query(): Promise<void> {
    const records = await this.logger.query({ logger: 'lab', limit: 20 });
    this.readout.set(JSON.stringify(records, null, 2));
  }
}
