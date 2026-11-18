import {
  UwtTelemetryObservedEvent,
  UwtTelemetryPublishInput
} from '../../models/uwt-telemetry-monitor.models/uwt-telemetry-monitor.models';
import {
  uwtDeepClone,
  UwtReporter,
  uwtSafeVoid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * What {@link UwtTelemetryMonitor} needs.
 *
 * @group Interfaces
 */
export interface UwtTelemetryMonitorOptions {
  /** Receives what is handled silently; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * A read-only view of every event the engine hands to a destination — the
 * telemetry sink or the application's log store.
 *
 * Each hand-off publishes here immediately *after* the hand-off, with the
 * very object it just sent. Nothing is sent from here: this is an in-memory
 * stream for observers such as an event inspector, never a second delivery
 * path, so observing it cannot cause an event to be sent twice.
 *
 * Costs one check per event while nobody listens. A listener receives a deep
 * copy of each payload, so it can neither change what was sent nor see a
 * live object change after the fact.
 *
 * "Handed over" is not "delivered": a sink may still drop an event, for
 * example when RUM samples a session out or reaches its event limit.
 *
 * @example
 * ```typescript
 * const monitor = new UwtTelemetryMonitor();
 * const telemetry = uwtCreateTelemetry({
 *   identity,
 *   destination,
 *   logApi,
 *   monitor
 * });
 * const stop = monitor.subscribe((event) => console.table(event.payload));
 * ```
 *
 * @group Classes
 */
export class UwtTelemetryMonitor {
  private readonly listeners = new Set<
    (event: UwtTelemetryObservedEvent) => void
  >();

  private readonly report?: UwtReporter;
  private sequence = 0;

  constructor(options: UwtTelemetryMonitorOptions = {}) {
    this.report = options.report;
  }

  /** Whether anything is listening. */
  get observed(): boolean {
    return this.listeners.size > 0;
  }

  /**
   * Listens to every event handed over from now on.
   *
   * @param listener called with each observed event
   * @returns a function that stops listening
   */
  subscribe(listener: (event: UwtTelemetryObservedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Records one hand-off. Called by the engine's own hand-off sites; an
   * application has no reason to call it.
   *
   * @param input the event just handed over, and where it went
   * @returns the sequence number assigned, or `undefined` when nobody is
   *   listening and the event was not recorded
   */
  publish(input: UwtTelemetryPublishInput): number | undefined {
    if (!this.observed) {
      return undefined;
    }
    const sequence = ++this.sequence;
    uwtSafeVoid(
      'monitor.publish',
      () => {
        const event = {
          ...input,
          payload: uwtDeepClone(input.payload),
          sequence,
          capturedAt: new Date().toISOString()
        } as UwtTelemetryObservedEvent;
        // A listener that throws doesn't keep the event from the others.
        for (const listener of [...this.listeners]) {
          uwtSafeVoid('monitor.listener', () => listener(event), this.report);
        }
      },
      this.report
    );
    return sequence;
  }

  /** Stops every listener; nothing is recorded afterwards. */
  dispose(): void {
    this.listeners.clear();
  }
}
