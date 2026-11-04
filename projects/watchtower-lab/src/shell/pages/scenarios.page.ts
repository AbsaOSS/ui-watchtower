import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap } from 'rxjs';
import {
  traceScenario,
  UwtScenario,
  UwtScenarioTelemetryService
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Component({
  selector: 'lab-scenarios-page',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Scenarios</h1>
      <p>
        Each settled scenario's record appears below, as the sink receives it.
      </p>

      <div class="lab-card">
        <h2>Settling</h2>
        <div class="lab-actions">
          <cps-button label="Complete, with 3 steps" (clicked)="happyPath()" />
          <cps-button
            label="Fail with an error"
            type="outlined"
            (clicked)="failure()" />
          <cps-button label="Cancel" type="outlined" (clicked)="cancel()" />
          <cps-button
            label="Incomplete"
            type="outlined"
            (clicked)="incomplete()" />
          <cps-button
            label="Time out after 1.5 s"
            type="outlined"
            (clicked)="timeout()" />
        </div>
      </div>

      <div class="lab-card">
        <h2>Timing</h2>
        <div class="lab-actions">
          <cps-button
            label="Backdated by 1.5 s"
            type="outlined"
            (clicked)="backdated()" />
          <cps-button
            label="5 aggregated batches"
            type="outlined"
            (clicked)="aggregates()" />
        </div>
      </div>

      <div class="lab-card">
        <h2>HTTP, with traceScenario</h2>
        <p>
          Search cancels the search in flight (switchMap): click it several
          times quickly, and only the last one completes; the others settle as
          abandoned, with abandonedBy: caller.
        </p>
        <div class="lab-actions">
          <cps-button
            label="Request (600 ms)"
            type="outlined"
            (clicked)="request()" />
          <cps-button
            label="Request that fails (500)"
            type="outlined"
            (clicked)="failingRequest()" />
          <cps-button
            label="Search"
            type="outlined"
            (clicked)="searches.next(800)" />
        </div>
      </div>

      <div class="lab-card">
        <h2>A running scenario</h2>
        <div class="lab-actions">
          <cps-button
            label="Start"
            type="outlined"
            (clicked)="startRunning()" />
          <cps-button
            label="Show toRecord()"
            type="outlined"
            (clicked)="showRunning()" />
          <cps-button
            label="Complete it"
            type="outlined"
            (clicked)="completeRunning()" />
        </div>
      </div>

      <pre class="lab-readout">{{ readout() || 'Nothing settled yet.' }}</pre>
    </section>
  `
})
export class ScenariosPage {
  protected readonly readout = signal('');
  protected readonly searches = new Subject<number>();

  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly http = inject(HttpClient);
  private running?: UwtScenario;

  constructor() {
    this.scenarios.settled$
      .pipe(takeUntilDestroyed())
      .subscribe((record) => this.readout.set(JSON.stringify(record, null, 2)));

    this.searches
      .pipe(
        switchMap((delay) =>
          this.http.get('/api/data', { params: { delay } }).pipe(
            traceScenario(
              this.scenarios.start({
                name: 'lab-superseded',
                metadata: { delay }
              })
            )
          )
        ),
        takeUntilDestroyed()
      )
      .subscribe();
  }

  protected async happyPath(): Promise<void> {
    const scenario = this.scenarios.start({ name: 'lab-happy-path' });
    scenario.step('fetch');
    await wait(300);
    scenario.step('validate');
    await wait(200);
    scenario.step('render');
    await wait(100);
    scenario.complete();
  }

  protected failure(): void {
    const scenario = this.scenarios.start({ name: 'lab-failure' });
    scenario.step('fetch');
    scenario.fail({ error: new Error('The backend said no'), statusCode: 503 });
  }

  protected cancel(): void {
    this.scenarios.start({ name: 'lab-cancel' }).cancel();
  }

  protected incomplete(): void {
    this.scenarios.start({ name: 'lab-incomplete' }).incomplete();
  }

  protected timeout(): void {
    this.scenarios
      .start({ name: 'lab-timeout', timeoutMs: 1500 })
      .step('fetch');
  }

  protected backdated(): void {
    this.scenarios
      .start({ name: 'lab-backdated', startedAt: performance.now() - 1500 })
      .complete();
  }

  protected async aggregates(): Promise<void> {
    const scenario = this.scenarios.start({ name: 'lab-aggregates' });
    for (let batch = 0; batch < 5; batch++) {
      scenario.aggregateStart('batch');
      await wait(40);
      scenario.aggregateEnd('batch');
    }
    scenario.complete();
  }

  protected request(): void {
    const scenario = this.scenarios.start({ name: 'lab-http' });
    this.http
      .get('/api/data', { params: { delay: 600 } })
      .pipe(traceScenario(scenario))
      .subscribe();
  }

  protected failingRequest(): void {
    const scenario = this.scenarios.start({ name: 'lab-http-error' });
    this.http
      .get('/api/data', { params: { status: 500 } })
      .pipe(traceScenario(scenario))
      .subscribe({ error: () => undefined });
  }

  protected startRunning(): void {
    this.running = this.scenarios.start({ name: 'lab-happy-path' });
    this.running.step('fetch');
    this.showRunning();
  }

  protected showRunning(): void {
    this.readout.set(
      this.running
        ? JSON.stringify(this.running.toRecord(), null, 2)
        : 'Start a scenario first.'
    );
  }

  protected completeRunning(): void {
    this.running?.complete();
    this.running = undefined;
  }
}
