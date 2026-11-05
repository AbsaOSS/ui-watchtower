import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  UwtScenarioTelemetryService,
  UwtTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtRumTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower/rum';
import { CpsButtonComponent } from 'cps-ui-kit';

@Component({
  selector: 'lab-lifecycle-page',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Lifecycle</h1>
      <div class="lab-card">
        <h2>Flushing</h2>
        <p>
          Sends what the sink is holding now, rather than at its next batch.
        </p>
        <div class="lab-actions">
          <cps-button label="Flush now" (clicked)="sink.flush()" />
        </div>
      </div>
      <div class="lab-card">
        <h2>Leaving with a scenario running</h2>
        <p>
          Starts lab-abandoned, then reloads. As the page goes, the scenario is
          settled as abandoned and sent by beacon: look for it On the wire.
        </p>
        <div class="lab-actions">
          <cps-button
            label="Start a scenario and reload"
            type="outlined"
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
            type="outlined"
            [disabled]="!rum"
            (clicked)="rum?.recordPageView('/lab/virtual-page')" />
        </div>
      </div>
      <div class="lab-card">
        <h2>Hiding the tab</h2>
        <p>
          Switch to another tab, then come back: the sink flushes when the page
          is hidden, so whatever was waiting shows up On the wire straight away.
        </p>
      </div>
    </section>
  `
})
export class LifecyclePage {
  protected readonly sink = inject(UwtTelemetrySink);
  protected readonly rum =
    this.sink instanceof UwtRumTelemetrySink ? this.sink : undefined;

  private readonly scenarios = inject(UwtScenarioTelemetryService);

  protected leave(): void {
    this.scenarios.start({ name: 'lab-abandoned' }).step('fetch');
    location.reload();
  }
}
