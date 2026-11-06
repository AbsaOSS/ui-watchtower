import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import {
  UwtBITelemetryService,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabResultsComponent } from '../../lab/lab-results.component';

@Component({
  selector: 'lab-bi-page',
  imports: [CpsButtonComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>BI events</h1>
      <p>
        Identical events within 400 ms are collapsed into one. Results shows
        what was sent, and when it arrived.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>Tracking</h2>
          <div class="lab-actions">
            <cps-button label="Track a click" (clicked)="click()" />
            <cps-button
              label="Fire twice at once"
              type="outlined"
              (clicked)="doubleFire()" />
            <cps-button
              label="Feature, tied to a scenario"
              type="outlined"
              (clicked)="feature()" />
          </div>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ readout() || 'Nothing tracked yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class BIPage {
  protected readonly readout = signal('');

  private readonly bi = inject(UwtBITelemetryService);
  private readonly scenarios = inject(UwtScenarioTelemetryService);

  protected click(): void {
    this.bi.track('lab_button_clicked', { button: 'primary', page: 'bi' });
    this.readout.set(
      'lab_button_clicked — click again within 400 ms: no second event.'
    );
  }

  protected doubleFire(): void {
    this.bi.track('lab_double_fired', { source: 'click-and-keydown' });
    this.bi.track('lab_double_fired', { source: 'click-and-keydown' });
    this.readout.set('lab_double_fired tracked twice — one event arrives.');
  }

  protected feature(): void {
    const scenario = this.scenarios.start({ name: 'lab-happy-path' });
    this.bi.track(
      'lab_feature_used',
      { theme: 'dark' },
      { feature: 'theme-switcher', scenarioId: scenario.id }
    );
    scenario.complete();
    this.readout.set(`lab_feature_used, with scenarioId ${scenario.id}`);
  }
}
