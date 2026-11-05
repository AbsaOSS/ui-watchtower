import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';
import {
  UwtBITelemetryService,
  UwtLoggerService,
  UwtScenarioTelemetryService,
  UwtTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower';
import { CpsButtonComponent } from 'cps-ui-kit';

const CARLA = '5c8e2f14-1b7d-4a96-9e3c-8d2b7f4a6c10';

@Component({
  selector: 'lab-fragment-root',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page lab-fragment">
      <h1>lab-fragment</h1>
      <p>
        Session {{ identity().sessionId ?? '—' }} · user
        {{ identity().userId ?? '—' }}, as the shell announced them.
      </p>
      <div class="lab-actions">
        <cps-button label="Track a BI event" (clicked)="track()" />
        <cps-button
          label="Run a scenario"
          type="outlined"
          (clicked)="scenario()" />
        <cps-button label="Log a warning" type="outlined" (clicked)="warn()" />
        <cps-button label="Log an error" type="outlined" (clicked)="error()" />
        <cps-button
          label="Query its logs"
          type="outlined"
          (clicked)="query()" />
        <cps-button
          label="Sign in as Carla"
          type="outlined"
          (clicked)="sink.setUserId(carla)" />
        <cps-button
          label="Sign out"
          type="outlined"
          (clicked)="sink.setUserId(undefined)" />
      </div>
      <pre class="lab-readout">{{ readout() || 'Nothing yet.' }}</pre>
    </section>
  `,
  styles: `
    .lab-fragment {
      padding: 1rem;
    }
  `
})
export class FragmentComponent {
  protected readonly sink = inject(UwtTelemetrySink);
  protected readonly carla = CARLA;
  protected readonly identity = signal<{ sessionId?: string; userId?: string }>(
    {}
  );

  protected readonly readout = signal('');

  private readonly bi = inject(UwtBITelemetryService);
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly loggerService = inject(UwtLoggerService);
  private readonly logger = this.loggerService.getLogger('fragment');

  constructor() {
    const timer = setInterval(
      () =>
        this.identity.set({
          sessionId: this.sink.getSessionId(),
          userId: this.sink.getUserId()
        }),
      1000
    );
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected track(): void {
    this.bi.track('fragment_button_clicked', { at: Date.now() });
    this.readout.set('fragment_button_clicked sent to the shell.');
  }

  protected scenario(): void {
    const journey = this.scenarios.start({ name: 'fragment-journey' });
    journey.step('fetch');
    journey.step('render');
    journey.complete();
    this.readout.set('fragment-journey completed and sent to the shell.');
  }

  protected warn(): void {
    this.logger.warn('A warning from the fragment');
    this.readout.set('Warning sent to the shell, for its log backend.');
  }

  /** Mirrored to RUM: the shell records it, named for this fragment. */
  protected error(): void {
    this.logger.error('The fragment failed', {
      error: new Error('Fragment boom')
    });
    this.readout.set('Error sent to the shell, and mirrored to RUM there.');
  }

  protected async query(): Promise<void> {
    const records = await this.loggerService.query({ logger: 'fragment' });
    this.readout.set(
      `${records.length} record(s), answered by the shell's log backend:\n` +
        JSON.stringify(records, null, 2)
    );
  }
}
