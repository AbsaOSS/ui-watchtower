import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  UwtTelemetryMonitor,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ngx-ui-watchtower';
import { LabWire } from './lab-wire.service';

/** How many of the page's latest events are listed. */
const LISTED = 8;

const KIND: Record<UwtTelemetryObservedEvent['kind'], string> = {
  bi: 'BI',
  scenario: 'Scenario',
  'scenario-step': 'Step',
  log: 'Log',
  error: 'Error',
  unknown: 'Event'
};

function field(payload: unknown, key: string): string {
  const value = (payload as Record<string, unknown> | null)?.[key];
  return value === undefined || value === null ? '' : String(value);
}

/** What an event is called, as the list shows it. */
function nameOf(event: UwtTelemetryObservedEvent): string {
  const p = event.payload;
  switch (event.kind) {
    case 'bi':
      return field(p, 'eventName');
    case 'scenario':
      return `${field(p, 'scenarioName')} · ${field(p, 'status')}`;
    case 'scenario-step':
      return `${field(p, 'scenarioName')} · ${field(p, 'name')}`;
    case 'log':
      return `${field(p, 'level')} · ${field(p, 'message')}`;
    case 'error':
      return `${field(p, 'name')}: ${field(p, 'message')}`;
    default:
      return 'eventType' in event ? event.eventType : '';
  }
}

/**
 * A page's results, beside its actions: the page's own readouts, projected,
 * then what the page has sent since it opened, each ticked once the lab's
 * mock backend has it. The latest change is said in a polite live region.
 *
 * Arrival is matched by content: a BI or scenario event's payload is RUM's
 * details, a log record arrives as it was handed over, and an error, which
 * RUM records its own way, by its message.
 */
@Component({
  selector: 'lab-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'lab-results' },
  template: `
    <h2>Results</h2>
    <ng-content />
    <h3>Sent from this page</h3>
    @if (items().length === 0) {
      <p>Nothing yet.</p>
    } @else {
      <ol class="lab-results__sent">
        @for (item of items(); track item.sequence) {
          <li>
            <span class="lab-results__kind">{{ item.kind }}</span>
            <span class="lab-results__name" [title]="item.name">{{
              item.name
            }}</span>
            <span
              class="lab-results__state"
              [class.lab-results__state--received]="item.received"
              >{{ item.received ? '✓ received' : 'sent' }}</span
            >
          </li>
        }
      </ol>
    }
    <p class="cps-sr-only" role="status">{{ said() }}</p>
  `
})
export class LabResultsComponent {
  private readonly wire = inject(LabWire);
  private readonly sent = signal<readonly UwtTelemetryObservedEvent[]>([]);

  /** Whether the mock backend has an event. */
  private readonly arrived = computed(() => {
    const rum = this.wire.rum();
    const details = new Set(rum.map((e) => JSON.stringify(e.details)));
    const errors = new Set(
      rum
        .filter((e) => e.type.endsWith('js_error_event'))
        .map((e) => field(e.details, 'message'))
    );
    const logs = new Set(this.wire.logs().map((r) => JSON.stringify(r)));
    return (event: UwtTelemetryObservedEvent): boolean =>
      event.destination === 'log-provider'
        ? logs.has(JSON.stringify(event.payload))
        : event.kind === 'error'
          ? errors.has(field(event.payload, 'message'))
          : details.has(JSON.stringify(event.payload));
  });

  protected readonly items = computed(() => {
    const arrived = this.arrived();
    return this.sent().map((event) => ({
      sequence: event.sequence,
      kind: KIND[event.kind],
      name: nameOf(event),
      received: arrived(event)
    }));
  });

  /** The latest event and where it is, for screen readers. */
  protected readonly said = computed(() => {
    const [latest] = this.items();
    return latest
      ? `${latest.kind} ${latest.name}: ${latest.received ? 'received' : 'sent'}.`
      : '';
  });

  constructor() {
    inject(UwtTelemetryMonitor)
      .events$.pipe(takeUntilDestroyed())
      .subscribe((event) =>
        this.sent.update((sent) => [event, ...sent].slice(0, LISTED))
      );
  }
}
