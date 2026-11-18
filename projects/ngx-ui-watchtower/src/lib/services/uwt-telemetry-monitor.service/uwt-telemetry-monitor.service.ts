import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  UwtTelemetryMonitor as CoreTelemetryMonitor,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ui-watchtower';
import { uwtDevModeReporter } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * A read-only view of every event this library hands to a destination —
 * the telemetry sink or the application's log API provider.
 *
 * Each hand-off site publishes here immediately *after* the hand-off, with
 * the very object it just sent. Nothing is sent from here: this is an
 * in-memory stream for observers such as the Event Inspector, never a
 * second delivery path, so observing it cannot cause an event to be sent
 * twice.
 *
 * Costs one check per event while nobody subscribes. A subscriber receives
 * a deep copy of each payload, so it can neither change what was sent nor
 * see a live object change after the fact.
 *
 * "Handed over" is not "delivered": a sink may still drop an event, for
 * example when RUM samples a session out or reaches its event limit.
 *
 * @example
 * ```typescript
 * inject(UwtTelemetryMonitor)
 *   .events$.pipe(filter((e) => e.kind === 'scenario'))
 *   .subscribe((e) => console.table(e.payload));
 * ```
 *
 * @group Services
 */
@Injectable({ providedIn: 'root' })
export class UwtTelemetryMonitor
  extends CoreTelemetryMonitor
  implements OnDestroy
{
  private readonly _events$ = new Subject<UwtTelemetryObservedEvent>();

  /** Every observed event, from the moment of subscription onward. */
  readonly events$: Observable<UwtTelemetryObservedEvent> =
    new Observable<UwtTelemetryObservedEvent>((subscriber) => {
      const subscription = this._events$.subscribe(subscriber);
      // Listens to the core only while observed: the core copies each event
      // for its listeners, wasted work when nobody reads it.
      if (!this.destroyed) {
        this.stopListening ??= this.subscribe((event) =>
          this._events$.next(event)
        );
      }
      return () => {
        subscription.unsubscribe();
        if (!this._events$.observed) {
          this.stopListening?.();
          this.stopListening = undefined;
        }
      };
    });

  /** Stops the core's listener; set while {@link events$} has subscribers. */
  private stopListening?: () => void;
  private destroyed = false;

  constructor() {
    super({ report: uwtDevModeReporter });
  }

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.destroyed = true;
    this.dispose();
    this._events$.complete();
  }
}
