import { DestroyRef, inject, Injectable } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  UwtTelemetryMonitor,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorSectionId } from '../uwt-inspector.models/uwt-inspector.models';
import { uwtInspectorSectionOf } from '../uwt-inspector-filter/uwt-inspector-filter';

/** What the ring held when the popup asked. */
export interface UwtInspectorRingSnapshot {
  /** Every kind's events, oldest first. */
  events: UwtTelemetryObservedEvent[];
  /** Events of each kind dropped to stay within the limit. */
  dropped: Record<UwtInspectorSectionId, number>;
  /** When it began keeping them: the app's start, or the last clear. */
  startedAt?: string;
}

/**
 * The latest events of each kind from the app's start, for
 * `captureBeforeOpen`: the popup adopts them when it opens, so it shows what
 * happened before. Started by `UwtEventInspectorService` at startup, and
 * runs for the app's lifetime; closing the popup leaves it running.
 */
@Injectable({ providedIn: 'root' })
export class UwtInspectorRing {
  private readonly monitor = inject(UwtTelemetryMonitor);

  private events = empty<UwtTelemetryObservedEvent[]>(() => []);
  private dropped = empty(() => 0);
  private limit = 0;
  private startedAt?: string;
  private subscription?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  /** Starts keeping up to `limit` events of each kind; once only. */
  start(limit: number): void {
    if (this.subscription || !(limit >= 1)) {
      return;
    }
    this.limit = Math.floor(limit);
    this.startedAt = new Date().toISOString();
    this.subscription = this.monitor.events$.subscribe((event) =>
      this.keep(event)
    );
  }

  snapshot(): UwtInspectorRingSnapshot {
    return {
      events: [
        ...this.events.bi,
        ...this.events.scenario,
        ...this.events.logging
      ].sort((a, b) => a.sequence - b.sequence),
      dropped: { ...this.dropped },
      startedAt: this.startedAt
    };
  }

  /** Empties it, as the popup's Clear does; it keeps running. */
  clear(): void {
    this.events = empty(() => []);
    this.dropped = empty(() => 0);
    if (this.subscription) {
      this.startedAt = new Date().toISOString();
    }
  }

  private keep(event: UwtTelemetryObservedEvent): void {
    const id = uwtInspectorSectionOf(event.kind);
    const kept = this.events[id];
    kept.push(event);
    if (kept.length > this.limit) {
      kept.shift();
      this.dropped[id]++;
    }
  }
}

function empty<T>(make: () => T): Record<UwtInspectorSectionId, T> {
  return { bi: make(), scenario: make(), logging: make() };
}
