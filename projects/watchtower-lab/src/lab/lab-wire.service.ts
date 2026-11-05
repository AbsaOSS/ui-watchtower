import {
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal
} from '@angular/core';
import { UwtLogRecord } from '@absaoss-cps/ngx-ui-watchtower';

/** One RUM event as the mock dataplane received it, with its batch's user. */
export interface LabRumEvent {
  receivedAt: string;
  batch: number;
  user: { sessionId?: string; userId?: string };
  type: string;
  metadata: Record<string, unknown>;
  details: Record<string, unknown>;
}

export type LabBrokerMode = 'ok' | 'null' | 'fail' | 'short-expiry';

/** RUM's own telemetries, as the mock broker names them. */
export const LAB_TELEMETRIES = [
  'errors',
  'performance',
  'interaction',
  'http',
  'replay'
] as const;

export type LabTelemetry = (typeof LAB_TELEMETRIES)[number];

/** How often "On the wire" and the status bar ask the mock backend, in ms. */
const POLL_MS = 1500;

/**
 * `fetch` as it was before RUM wrapped it: this module loads before RUM
 * starts. RUM's `http` telemetry records the app's requests, and the lab's
 * own polling would otherwise add an event every 1.5 s, forever. The server
 * never polls.
 */
const labFetch =
  typeof window === 'undefined' ? fetch : window.fetch.bind(window);

/**
 * What actually reached the lab's mock backend: every RUM event the
 * dataplane received and every log record the log backend stored — the
 * other side of what the app (and the Event Inspector) says it sent.
 */
@Injectable({ providedIn: 'root' })
export class LabWire {
  readonly batches = signal(0);
  readonly rum = signal<readonly LabRumEvent[]>([]);
  readonly logs = signal<readonly UwtLogRecord[]>([]);
  readonly brokerMode = signal<LabBrokerMode>('ok');
  /** RUM telemetries the broker names; `null` for the library's default. */
  readonly telemetries = signal<readonly LabTelemetry[] | null>(null);

  readonly telemetriesLabel = computed(() => {
    const telemetries = this.telemetries();
    return telemetries === null ? 'default' : telemetries.join(', ') || 'none';
  });

  /** The library's own events, as opposed to RUM's page views and timings. */
  readonly libraryEvents = computed(
    () => this.rum().filter((e) => e.type.startsWith('com.uwt.')).length
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // In the browser only: on the server, a timer would keep the render from
    // ever finishing.
    afterNextRender(() => {
      const timer = setInterval(() => this.refresh(), POLL_MS);
      destroyRef.onDestroy(() => clearInterval(timer));
      this.refresh();
    });
  }

  async refresh(): Promise<void> {
    try {
      const [rum, logs, state] = await Promise.all([
        labFetch('/__lab/rum').then((r) => r.json()),
        labFetch('/__lab/logs').then((r) => r.json()),
        labFetch('/__lab/state').then((r) => r.json())
      ]);
      this.batches.set(rum.batches);
      this.rum.set(rum.events);
      this.logs.set(logs);
      this.brokerMode.set(state.brokerMode);
      this.telemetries.set(state.telemetries);
    } catch {
      // The mock backend isn't running: `npm run lab` starts it.
    }
  }

  async reset(): Promise<void> {
    await labFetch('/__lab/reset', { method: 'POST' });
    await this.refresh();
  }

  /** The broker answers the next `/rum/init` this way; reload to apply it. */
  async setBrokerMode(mode: LabBrokerMode): Promise<void> {
    await labFetch('/__lab/broker-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    this.brokerMode.set(mode);
  }

  /** The broker names these in its next answer; reload to apply them. */
  async setTelemetries(
    telemetries: readonly LabTelemetry[] | null
  ): Promise<void> {
    await labFetch('/__lab/telemetries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ telemetries })
    });
    this.telemetries.set(telemetries);
  }
}
