import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal
} from '@angular/core';
import {
  UwtTelemetryMonitor,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtInspectorEntry,
  UwtInspectorFieldFilter,
  UwtInspectorFilterState,
  UwtInspectorKindFilter,
  UwtInspectorSectionId,
  UwtEventInspectorConfig
} from '../uwt-inspector.models/uwt-inspector.models';
import {
  uwtInspectorSectionOf,
  uwtFlattenEvent,
  uwtKnownPaths,
  uwtMatchesFilters
} from '../uwt-inspector-filter/uwt-inspector-filter';
import { uwtSafeStringify } from '../uwt-inspector-export/uwt-inspector-export';
import { UwtInspectorRing } from '../uwt-inspector-ring/uwt-inspector-ring';

/** Library defaults, applied under whatever the application configures. */
export const UWT_DEFAULT_INSPECTOR_CONFIG: Omit<
  UwtEventInspectorConfig,
  'shortcuts'
> = {
  enabled: true,
  maxEventsPerSection: 500,
  maxPayloadCharsInView: 256 * 1024,
  captureBeforeOpen: 0
};

/** How often arriving events reach the screen, in milliseconds. */
export const UWT_INSPECTOR_FLUSH_MS = 250;
/** How long a row counts as new, in milliseconds. */
const FRESH_MS = 3000;

export const UWT_INSPECTOR_SECTIONS: readonly UwtInspectorSectionId[] = [
  'bi',
  'scenario',
  'logging'
];

type PerSection<T> = Record<UwtInspectorSectionId, T>;

function perSection<T>(make: () => T): PerSection<T> {
  return { bi: make(), scenario: make(), logging: make() };
}

/**
 * The inspector's captured history. Held by the `UwtInspectorSession`, so
 * it lasts from opening to closing, whichever docks the inspector moves
 * between: created on open — empty, or with what {@link UwtInspectorRing}
 * kept from before — subscribed to {@link UwtTelemetryMonitor} for its
 * lifetime, and discarded on close.
 *
 * Events arrive whenever the application sends them; they are batched and
 * reach the screen at most every {@link UWT_INSPECTOR_FLUSH_MS}, so a
 * burst causes one re-render rather than hundreds. Each kind keeps at most
 * `maxEventsPerSection`, newest first, and counts what it dropped; the
 * timeline shows them merged, newest first.
 */
@Injectable()
export class UwtInspectorStore {
  private readonly monitor = inject(UwtTelemetryMonitor);
  private readonly ring = inject(UwtInspectorRing);
  private readonly config: UwtEventInspectorConfig = {
    ...UWT_DEFAULT_INSPECTOR_CONFIG,
    shortcuts: [],
    ...inject(UWT_EVENT_INSPECTOR_CONFIG, { optional: true })
  };

  /** Newest first. Written on every flush, paused or not. */
  private readonly buffers = perSection<UwtInspectorEntry[]>(() => []);
  private readonly droppedCount = perSection(() => 0);
  private pending: UwtInspectorEntry[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private freshTimer?: ReturnType<typeof setTimeout>;

  /**
   * When capturing began: the popup opening, the app's start with
   * `captureBeforeOpen`, or the last clear.
   */
  readonly startedAt = signal(new Date().toISOString());

  /** What the popup shows: the buffers as of the last unpaused flush. */
  readonly entries = signal<PerSection<readonly UwtInspectorEntry[]>>(
    perSection(() => [])
  );

  readonly dropped = signal<PerSection<number>>(perSection(() => 0));

  /** Freezes what is shown. Capturing carries on underneath. */
  readonly paused = signal(false);
  /** When the user paused; `undefined` while capturing live. */
  readonly pausedAt = signal<string | undefined>(undefined);
  /** Events captured while paused and not yet shown. */
  readonly newWhilePaused = signal(0);

  /**
   * Events received per kind since opening or the last clear — keeps
   * rising after the retention cap, unlike the kinds' lengths.
   */
  readonly received = signal<PerSection<number>>(perSection(() => 0));

  /** Sequence numbers from the latest flush, for a "new" marker. */
  readonly fresh = signal<ReadonlySet<number>>(new Set());

  /** Which kind the timeline shows, and exports. */
  readonly kind = signal<UwtInspectorKindFilter>('all');

  /** The timeline's search text and field filters, for every kind. */
  readonly filters = signal<UwtInspectorFilterState>(emptyFilters());

  /** Each kind's entries that match the filters. */
  private readonly matching = computed<
    PerSection<readonly UwtInspectorEntry[]>
  >(() => {
    const entries = this.entries();
    const filters = this.filters();
    return perSectionFrom((id) =>
      isFiltering(filters)
        ? entries[id].filter((e) => uwtMatchesFilters(e.fields, filters))
        : entries[id]
    );
  });

  /** How many events of each kind match the filters. */
  readonly matchCounts = computed<PerSection<number>>(() => {
    const matching = this.matching();
    return perSectionFrom((id) => matching[id].length);
  });

  /** The timeline: entries of the kind shown that match, newest first. */
  readonly filtered = computed<readonly UwtInspectorEntry[]>(() =>
    this.ofKind(this.matching(), this.kind())
  );

  /** Field paths seen so far in the kind shown, for filter suggestions. */
  readonly knownPaths = computed<string[]>(() =>
    uwtKnownPaths(this.ofKind(this.entries(), this.kind()).map((e) => e.fields))
  );

  readonly total = computed(() => {
    const entries = this.entries();
    return UWT_INSPECTOR_SECTIONS.reduce((n, id) => n + entries[id].length, 0);
  });

  constructor() {
    this.adopt();
    // Straight after adopting: nothing can arrive in between.
    const subscription = this.monitor.events$.subscribe((event) =>
      this.receive(event)
    );
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      clearTimeout(this.flushTimer);
      clearTimeout(this.freshTimer);
    });
  }

  /** Empties every kind, and what was kept from before. Capturing continues. */
  clear(): void {
    this.ring.clear();
    for (const id of UWT_INSPECTOR_SECTIONS) {
      this.buffers[id] = [];
      this.droppedCount[id] = 0;
    }
    this.pending = [];
    this.startedAt.set(new Date().toISOString());
    this.newWhilePaused.set(0);
    this.received.set(perSection(() => 0));
    this.publish();
  }

  setPaused(paused: boolean): void {
    if (paused !== this.paused()) {
      this.pausedAt.set(paused ? new Date().toISOString() : undefined);
    }
    this.paused.set(paused);
    if (!paused) {
      this.newWhilePaused.set(0);
      this.publish();
    }
  }

  setKind(kind: UwtInspectorKindFilter): void {
    this.kind.set(kind);
  }

  setText(text: string): void {
    this.filters.update((f) => ({ ...f, text }));
  }

  addFilter(filter: Omit<UwtInspectorFieldFilter, 'id'>): void {
    this.filters.update((f) => ({
      ...f,
      fields: [...f.fields, { ...filter, id: newId() }]
    }));
  }

  removeFilter(id: string): void {
    this.filters.update((f) => ({
      ...f,
      fields: f.fields.filter((x) => x.id !== id)
    }));
  }

  clearFilters(): void {
    this.filters.set(emptyFilters());
  }

  /**
   * Every event captured of a kind: what is shown, plus anything held back
   * while paused or still waiting for the next flush. Oldest first.
   */
  events(kind: UwtInspectorKindFilter): UwtTelemetryObservedEvent[] {
    return [
      ...this.captured(kind).map((e) => e.event),
      ...this.pendingOf(kind).map((e) => e.event)
    ].sort((a, b) => a.sequence - b.sequence);
  }

  /** A kind's totals for its export, counted like {@link events}. */
  count(kind: UwtInspectorKindFilter): {
    captured: number;
    droppedOldest: number;
  } {
    const ids = kind === 'all' ? UWT_INSPECTOR_SECTIONS : [kind];
    return {
      captured: this.captured(kind).length + this.pendingOf(kind).length,
      droppedOldest: ids.reduce((n, id) => n + this.droppedCount[id], 0)
    };
  }

  /** One kind's entries, or every kind's merged newest first. */
  private ofKind(
    entries: PerSection<readonly UwtInspectorEntry[]>,
    kind: UwtInspectorKindFilter
  ): readonly UwtInspectorEntry[] {
    return kind === 'all'
      ? UWT_INSPECTOR_SECTIONS.flatMap((id) => entries[id]).sort(
          (a, b) => b.event.sequence - a.event.sequence
        )
      : entries[kind];
  }

  private captured(kind: UwtInspectorKindFilter): UwtInspectorEntry[] {
    return kind === 'all'
      ? UWT_INSPECTOR_SECTIONS.flatMap((id) => this.buffers[id])
      : this.buffers[kind];
  }

  private pendingOf(kind: UwtInspectorKindFilter): UwtInspectorEntry[] {
    return kind === 'all'
      ? this.pending
      : this.pending.filter((e) => e.section === kind);
  }

  /**
   * Called for every observed event. Never throws: an error here would
   * surface asynchronously in the application, since RxJS reports
   * subscriber errors on its own.
   */
  private receive(event: UwtTelemetryObservedEvent): void {
    try {
      this.pending.push(this.prepare(event));
      this.flushTimer ??= setTimeout(
        () => this.flush(),
        UWT_INSPECTOR_FLUSH_MS
      );
    } catch {
      // Nothing to show for this one; later events are unaffected.
    }
  }

  private prepare(event: UwtTelemetryObservedEvent): UwtInspectorEntry {
    const section = uwtInspectorSectionOf(event.kind);
    try {
      return {
        event,
        section,
        fields: uwtFlattenEvent(event),
        sizeChars: uwtSafeStringify(event.payload).length
      };
    } catch (error) {
      return {
        event,
        section,
        fields: [],
        sizeChars: 0,
        renderError: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Takes on what the ring kept from before opening: shown at once, not
   * marked new, and not counted as received since opening.
   */
  private adopt(): void {
    const kept = this.ring.snapshot();
    if (kept.startedAt) {
      this.startedAt.set(kept.startedAt);
    }
    this.pending = kept.events.map((event) => this.prepare(event));
    this.drain();
    for (const id of UWT_INSPECTOR_SECTIONS) {
      this.droppedCount[id] += kept.dropped[id];
    }
    this.publish();
  }

  private flush(): void {
    this.flushTimer = undefined;
    const arrived = this.drain();
    if (arrived.length === 0) {
      return;
    }
    this.received.update((counts) => {
      const next = { ...counts };
      for (const entry of arrived) {
        next[entry.section]++;
      }
      return next;
    });
    if (this.paused()) {
      this.newWhilePaused.update((n) => n + arrived.length);
      return;
    }
    this.publish(arrived);
  }

  /** Moves pending events into the buffers. Returns what moved. */
  private drain(): UwtInspectorEntry[] {
    const arrived = this.pending;
    this.pending = [];
    const max = Math.max(1, this.config.maxEventsPerSection);
    for (const entry of arrived) {
      const buffer = this.buffers[entry.section];
      buffer.unshift(entry);
      if (buffer.length > max) {
        this.droppedCount[entry.section] += buffer.length - max;
        buffer.length = max;
      }
    }
    return arrived;
  }

  private publish(arrived: readonly UwtInspectorEntry[] = []): void {
    this.entries.set(perSectionFrom((id) => [...this.buffers[id]]));
    this.dropped.set({ ...this.droppedCount });
    this.fresh.set(new Set(arrived.map((e) => e.event.sequence)));
    clearTimeout(this.freshTimer);
    if (arrived.length) {
      this.freshTimer = setTimeout(() => this.fresh.set(new Set()), FRESH_MS);
    }
  }
}

function perSectionFrom<T>(
  make: (id: UwtInspectorSectionId) => T
): PerSection<T> {
  return {
    bi: make('bi'),
    scenario: make('scenario'),
    logging: make('logging')
  };
}

function emptyFilters(): UwtInspectorFilterState {
  return { text: '', fields: [] };
}

function isFiltering(filters: UwtInspectorFilterState): boolean {
  return !!filters.text.trim() || filters.fields.length > 0;
}

let idCounter = 0;
function newId(): string {
  return `f${++idCounter}`;
}
