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
import { LabResultsComponent } from '../../lab/lab-results.component';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Component({
  selector: 'lab-scenarios-page',
  imports: [CpsButtonComponent, LabResultsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-page--results">
      <h1>Scenarios</h1>
      <p>
        Each settled scenario's record appears in Results, as the sink receives
        it.
      </p>
      <div class="lab-page__cards">
        <div class="lab-card">
          <h2>Settling</h2>
          <div class="lab-actions">
            <cps-button
              label="Complete, with 3 steps"
              (clicked)="happyPath()" />
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
            <cps-button label="Backdated by 1.5 s" (clicked)="backdated()" />
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
            <cps-button label="Request (600 ms)" (clicked)="request()" />
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
            <cps-button label="Start" (clicked)="startRunning()" />
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

        <div class="lab-card">
          <h2>The rest of the scenario API</h2>
          <div class="lab-actions">
            <cps-button label="Steps with detail" (clicked)="detailed()" />
            <cps-button
              label="A parent and a child"
              type="outlined"
              (clicked)="family()" />
            <cps-button
              label="settle('incomplete')"
              type="outlined"
              (clicked)="settleDirectly()" />
            <cps-button
              label="51 at once"
              type="outlined"
              (clicked)="crowd()" />
          </div>
        </div>

        <div class="lab-card">
          <h2>Active scenarios</h2>
          <div class="lab-actions">
            <cps-button label="Start a long one" (clicked)="startLong()" />
            <cps-button
              label="Look them up"
              type="outlined"
              (clicked)="lookUp()" />
            <cps-button
              label="Cancel every active one"
              type="outlined"
              (clicked)="cancelActive()" />
          </div>
        </div>

        <div class="lab-card">
          <h2>traceScenario's options</h2>
          <div class="lab-actions">
            <cps-button
              label="outcome, from the response"
              (clicked)="outcomeFromResponse()" />
            <cps-button
              label="cancelOutcome, unsubscribed early"
              type="outlined"
              (clicked)="unsubscribedEarly()" />
            <cps-button
              label="valueThenTeardown: 'cancel'"
              type="outlined"
              (clicked)="valueThenCancel()" />
          </div>
        </div>
      </div>
      <lab-results>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Last result"
          >{{ readout() || 'Nothing settled yet.' }}</pre>
      </lab-results>
    </section>
  `
})
export class ScenariosPage {
  protected readonly readout = signal('');
  protected readonly searches = new Subject<number>();

  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly http = inject(HttpClient);
  private running?: UwtScenario;
  private long?: UwtScenario;

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
      .start({ name: 'lab-backdated', startedAt: Date.now() - 1500 })
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

  protected detailed(): void {
    const scenario = this.scenarios.start({ name: 'lab-detailed' });
    scenario.step('fetch', { rows: 3 });
    scenario.endStep({ message: 'Fetched' });
    scenario.step('validate');
    scenario.failStep(new Error('Row 2 is invalid'), { reason: 'validation' });
    scenario.setData({ orders: 2 });
    scenario.complete({
      statusCode: 200,
      message: 'Saved',
      reason: 'all-valid',
      metadata: { source: 'lab' }
    });
  }

  protected family(): void {
    const parent = this.scenarios.start({ name: 'lab-parent' });
    this.scenarios
      .start({
        name: 'lab-child',
        parentScenarioId: parent.id,
        feature: 'checkout',
        operation: 'pay',
        route: '/orders/:id'
      })
      .complete();
    parent.complete();
  }

  protected settleDirectly(): void {
    this.scenarios
      .start({ name: 'lab-settled' })
      .settle('incomplete', { reason: 'no-results' });
  }

  /** One past the 50 the library warns about, in development. */
  protected crowd(): void {
    const crowd = Array.from({ length: 51 }, () =>
      this.scenarios.start({ name: 'lab-crowd' })
    );
    crowd.forEach((scenario) => scenario.cancel());
  }

  /** Never times out: the one before it, if still running, is cancelled. */
  protected startLong(): void {
    this.long?.cancel();
    this.long = this.scenarios.start({ name: 'lab-long', timeoutMs: 0 });
    this.lookUp();
  }

  protected lookUp(): void {
    const id = this.long?.id;
    this.readout.set(
      JSON.stringify(
        {
          getActive: this.scenarios.getActive().map((s) => s.name),
          findByName: this.scenarios.findByName('lab-long').map((s) => s.id),
          find: id ? this.scenarios.find(id)?.name : undefined,
          findByNameAndId: id
            ? this.scenarios.findByNameAndId('lab-long', id)?.id
            : undefined
        },
        null,
        2
      )
    );
  }

  protected cancelActive(): void {
    for (const scenario of this.scenarios.getActive()) {
      scenario.cancel();
    }
    this.lookUp();
  }

  protected outcomeFromResponse(): void {
    this.http
      .get<{ status: number }>('/api/data')
      .pipe(
        traceScenario(this.scenarios.start({ name: 'lab-trace-outcome' }), {
          outcome: (response) => ({
            statusCode: response.status,
            message: 'Data arrived'
          })
        })
      )
      .subscribe();
  }

  protected unsubscribedEarly(): void {
    const subscription = this.http
      .get('/api/data', { params: { delay: 2000 } })
      .pipe(
        traceScenario(this.scenarios.start({ name: 'lab-trace-cancel' }), {
          cancelOutcome: { reason: 'navigated-away' }
        })
      )
      .subscribe();
    setTimeout(() => subscription.unsubscribe(), 100);
  }

  protected valueThenCancel(): void {
    const values = new Subject<number>();
    const subscription = values
      .pipe(
        traceScenario(this.scenarios.start({ name: 'lab-trace-teardown' }), {
          valueThenTeardown: 'cancel'
        })
      )
      .subscribe();
    values.next(1);
    subscription.unsubscribe();
  }
}
