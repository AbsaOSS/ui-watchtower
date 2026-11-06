import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild
} from '@angular/core';
import {
  CPS_LIVE_ANNOUNCER_SERVICE,
  CpsButtonComponent,
  CpsButtonToggleComponent,
  CpsButtonToggleOption,
  CpsMenuComponent,
  CpsMenuItem,
  CpsTableComponent
} from 'cps-ui-kit';
import {
  UwtInspectorKindFilter,
  UwtInspectorSectionId
} from '../uwt-inspector.models/uwt-inspector.models';
import {
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_INSPECTOR_SECTIONS,
  UwtInspectorStore
} from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorJsonComponent } from '../uwt-inspector-json/uwt-inspector-json.component';
import { UwtInspectorFilterBarComponent } from '../uwt-inspector-filter-bar/uwt-inspector-filter-bar.component';
import {
  uwtInspectorEventCount,
  uwtInspectorEventsNoun,
  UwtInspectorExporter
} from '../uwt-inspector-export/uwt-inspector-exporter';
import { UwtInspectorFilterBy, uwtInspectorRow } from './uwt-inspector-rows';

/** The kind toggle's labels. */
const KIND_LABEL: Record<UwtInspectorSectionId, string> = {
  bi: 'BI',
  scenario: 'Scenarios',
  logging: 'Logs'
};

/**
 * Every captured event in one table, newest first: a kind toggle with
 * counts, one search and set of filters for every kind, an Export menu for
 * the kind shown, and a paginated table whose rows open on the payload,
 * with ways to filter by its values and to reach the event it mirrors.
 */
@Component({
  selector: 'uwt-inspector-timeline',
  imports: [
    CpsButtonComponent,
    CpsButtonToggleComponent,
    CpsMenuComponent,
    CpsTableComponent,
    UwtInspectorJsonComponent,
    UwtInspectorFilterBarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uwt-inspector-timeline.component.html',
  styleUrl: './uwt-inspector-timeline.component.scss'
})
export class UwtInspectorTimelineComponent {
  protected readonly store = inject(UwtInspectorStore);
  private readonly exporter = inject(UwtInspectorExporter);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  private readonly announcer = inject(CPS_LIVE_ANNOUNCER_SERVICE, {
    optional: true
  });

  private readonly table = viewChild.required(CpsTableComponent);

  /** JSON length, in characters, above which a payload is shown truncated. */
  readonly maxPayloadChars = input(
    UWT_DEFAULT_INSPECTOR_CONFIG.maxPayloadCharsInView
  );

  /** Each kind with how many of its events match the filters. */
  protected readonly kindOptions = computed<CpsButtonToggleOption[]>(() => {
    const counts = this.store.matchCounts();
    const all = UWT_INSPECTOR_SECTIONS.reduce((n, id) => n + counts[id], 0);
    return [
      { value: 'all', label: `All ${all}` },
      ...UWT_INSPECTOR_SECTIONS.map((id) => ({
        value: id,
        label: `${KIND_LABEL[id]} ${counts[id]}`
      }))
    ];
  });

  protected readonly rows = computed(() =>
    this.store.filtered().map(uwtInspectorRow)
  );

  /**
   * The paginator's offset. Back to the first page, where the newest events
   * are, when the kind or filters change, or when the rows shrink past it,
   * as after a clear; otherwise kept while events arrive. The table won't
   * do this itself: PrimeNG steps back one page at most, so page four
   * filtered down to one page would show an empty table.
   */
  protected readonly first = linkedSignal({
    source: () => ({
      rows: this.rows().length,
      kind: this.store.kind(),
      filters: this.store.filters()
    }),
    computation: (source, previous): number =>
      previous &&
      previous.source.kind === source.kind &&
      previous.source.filters === source.filters &&
      previous.value < source.rows
        ? previous.value
        : 0
  });

  /** Rows per page, as the reader last chose. */
  private readonly pageSize = signal(25);

  /** The log events captured, to link an error back to its own. */
  protected readonly logSequences = computed(
    () => new Set(this.store.entries().logging.map((e) => e.event.sequence))
  );

  /** Each log event's sequence, to the error that mirrored it to RUM. */
  protected readonly mirroredTo = computed(() => {
    const mirrors = new Map<number, number>();
    for (const { event } of this.store.entries().logging) {
      if (event.kind === 'error' && event.relatedSequence) {
        mirrors.set(event.relatedSequence, event.sequence);
      }
    }
    return mirrors;
  });

  protected readonly emptyMessage = computed(() => {
    const kind = this.store.kind();
    const noun = uwtInspectorEventsNoun(kind);
    const captured =
      kind === 'all' ? this.store.total() : this.store.entries()[kind].length;
    return captured > 0 ? `No ${noun} match the filters.` : `No ${noun} yet.`;
  });

  /** Fresh arrivals above the page being read, newest first. */
  protected readonly unseenNew = computed(
    () =>
      this.rows()
        .slice(0, this.first())
        .filter((r) => this.store.fresh().has(r.sequence)).length
  );

  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly exportOpen = signal(false);
  /** What the Export menu says it holds; set as it opens. */
  protected readonly exportHeader = signal('');

  // No descriptions: cps-menu draws them below text contrast.
  protected readonly exportItems: CpsMenuItem[] = [
    { title: 'Copy JSON', icon: 'copy', action: () => this.copy() },
    { title: 'Download JSON', icon: 'download', action: () => this.download() }
  ];

  protected setKind(kind: UwtInspectorKindFilter): void {
    this.store.setKind(kind);
  }

  protected onPage(state: { first?: number; rows?: number }): void {
    this.first.set(state?.first ?? 0);
    this.pageSize.set(state?.rows ?? this.pageSize());
  }

  /** Adds a filter on a value from an open row, unless it's there already. */
  protected filterBy(field: UwtInspectorFilterBy): void {
    const exists = this.store
      .filters()
      .fields.some(
        (f) =>
          f.path === field.path &&
          f.operator === 'equals' &&
          f.value === field.value
      );
    if (!exists) {
      this.store.addFilter({
        path: field.path,
        operator: 'equals',
        value: field.value
      });
    }
  }

  /**
   * Shows an event's row, open: clears the search and filters if they hide
   * it, turns to its page, opens it, and moves focus to its payload.
   */
  protected reveal(sequence: number): void {
    if (!this.rows().some((r) => r.sequence === sequence)) {
      this.store.clearFilters();
      this.announce(`Filters cleared to show event #${sequence}.`);
    }
    const rows = this.rows();
    const index = rows.findIndex((r) => r.sequence === sequence);
    if (index < 0) {
      return;
    }
    const size = this.pageSize();
    this.first(); // settles the page reset that clearing the filters makes
    this.first.set(Math.floor(index / size) * size);
    const table = this.table().primengTable;
    if (!table.isRowExpanded(rows[index])) {
      table.toggleRow(rows[index]);
    }
    afterNextRender(
      () => {
        const content = this.host.nativeElement.querySelector(
          `[data-testid="cps-table-row-expanded-content-${sequence}"]`
        );
        // Optional: some environments, such as jsdom, have no scrolling.
        content?.previousElementSibling?.scrollIntoView?.({ block: 'start' });
        content
          ?.querySelector<HTMLElement>('pre')
          ?.focus({ preventScroll: true });
      },
      { injector: this.injector }
    );
  }

  protected goToNewest(): void {
    this.first.set(0);
  }

  protected toggleExport(menu: CpsMenuComponent, event: Event): void {
    const kind = this.store.kind();
    this.exportHeader.set(
      `${uwtInspectorEventCount(this.store.count(kind).captured, kind)}, with session and user ids`
    );
    menu.toggle(event);
  }

  protected isFresh(sequence: number): boolean {
    return this.store.fresh().has(sequence);
  }

  private announce(message: string): void {
    try {
      this.announcer?.announce(message, 'polite');
    } catch {
      // Announcements are a courtesy; never let one break the inspector.
    }
  }

  private download(): void {
    this.exporter.download(this.store.kind());
  }

  private async copy(): Promise<void> {
    this.copyState.set(
      (await this.exporter.copy(this.store.kind())) ? 'copied' : 'failed'
    );
    setTimeout(() => this.copyState.set('idle'), 2000);
  }
}
