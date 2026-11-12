import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import {
  UwtScenarioTelemetryService,
  UwtTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtRumTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower/rum';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabResultsComponent } from '../../lab/lab-results.component';

@Component({
  selector: 'lab-lifecycle-page',
  imports: [CpsButtonComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>Lifecycle</h1>
      <p>
        What the sink does around the page's own life: sending what it holds on
        request or when the tab hides, a scenario left running as the page goes,
        and page views the router doesn't see.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>Flushing</h2>
          <p>
            Sends what the sink is holding now, rather than at its next batch.
          </p>
          <div class="lab-actions">
            <cps-button label="Flush now" (clicked)="flush()" />
          </div>
        </div>
        <div class="lab-card">
          <h2>Leaving with a scenario running</h2>
          <p>
            Starts lab-abandoned, then reloads. As the page goes, the scenario
            is settled as abandoned and sent by beacon: look for it On the wire.
          </p>
          <div class="lab-actions">
            <cps-button
              label="Start a scenario and reload"
              (clicked)="leave()" />
          </div>
        </div>
        <div class="lab-card">
          <h2>A page view of its own</h2>
          <p>
            The RUM sink's recordPageView, for a view the router doesn't see:
            /lab/virtual-page. Only with the RUM destination.
          </p>
          <div class="lab-actions">
            <cps-button
              label="Record a page view"
              [disabled]="!rum"
              (clicked)="pageView()" />
          </div>
        </div>
        <div class="lab-card">
          <h2>Hiding the tab</h2>
          <p>
            Switch to another tab, then come back: the sink flushes when the
            page is hidden, so whatever was waiting shows up On the wire
            straight away.
          </p>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ readout() || 'Nothing done yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class LifecyclePage {
  private readonly sink = inject(UwtTelemetrySink);
  private readonly scenarios = inject(UwtScenarioTelemetryService);

  protected readonly readout = signal('');
  protected readonly rum =
    this.sink instanceof UwtRumTelemetrySink ? this.sink : undefined;

  protected flush(): void {
    this.sink.flush();
    this.readout.set('Flushed: what the sink held is on its way.');
  }

  protected leave(): void {
    this.scenarios.start({ name: 'lab-abandoned' }).step('fetch');
    location.reload();
  }

  protected pageView(): void {
    this.rum?.recordPageView('/lab/virtual-page');
    this.readout.set('Recorded a page view of /lab/virtual-page.');
  }
}
