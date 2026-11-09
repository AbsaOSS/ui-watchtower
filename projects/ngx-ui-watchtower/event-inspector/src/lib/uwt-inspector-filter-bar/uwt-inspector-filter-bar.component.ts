import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import {
  CpsAutocompleteComponent,
  CpsButtonComponent,
  CpsChipComponent,
  CpsInputComponent,
  CpsSelectComponent
} from 'cps-ui-kit';
import { UwtInspectorFilterOperator } from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorStore } from '../uwt-inspector-store/uwt-inspector-store';
import {
  uwtDescribeFilter,
  uwtFieldName,
  uwtOperatorNeedsValue
} from '../uwt-inspector-filter/uwt-inspector-filter';

/** Typing settles for this long before filtering runs, in milliseconds. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * The timeline's free-text search, field-filter builder and active
 * filters. They apply to every kind of event.
 */
@Component({
  selector: 'uwt-inspector-filter-bar',
  imports: [
    CpsInputComponent,
    CpsAutocompleteComponent,
    CpsSelectComponent,
    CpsButtonComponent,
    CpsChipComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uwt-inspector-filter-bar.component.html',
  styleUrl: './uwt-inspector-filter-bar.component.scss'
})
export class UwtInspectorFilterBarComponent {
  protected readonly store = inject(UwtInspectorStore);

  protected readonly filters = this.store.filters;

  protected readonly operators: {
    label: string;
    value: UwtInspectorFilterOperator;
  }[] = [
    { label: 'contains', value: 'contains' },
    { label: 'equals', value: 'equals' },
    { label: 'does not contain', value: 'not-contains' },
    { label: 'exists', value: 'exists' },
    { label: 'is missing', value: 'missing' }
  ];

  protected readonly builderOpen = signal(false);
  protected readonly path = signal('');
  protected readonly operator = signal<UwtInspectorFilterOperator>('contains');

  protected readonly value = signal('');

  /** Each field by name, its path below it; either finds it. */
  protected readonly pathOptions = computed(() =>
    this.store.knownPaths().map((path) => {
      const name = uwtFieldName(path);
      return {
        label: name,
        value: path,
        info: name === path ? '' : path,
        alias: path
      };
    })
  );

  protected readonly needsValue = computed(() =>
    uwtOperatorNeedsValue(this.operator())
  );

  protected readonly canAdd = computed(
    () => !!this.path().trim() && (!this.needsValue() || !!this.value().trim())
  );

  protected readonly chips = computed(() =>
    this.filters().fields.map((f) => ({
      id: f.id,
      text: uwtDescribeFilter(f)
    }))
  );

  protected readonly anyActive = computed(() => {
    const f = this.filters();
    return !!f.text.trim() || f.fields.length > 0;
  });

  private readonly injector = inject(Injector);
  private readonly addFilterButton = viewChild('addFilter', {
    read: ElementRef
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  protected onSearch(text: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(
      () => this.store.setText(text ?? ''),
      SEARCH_DEBOUNCE_MS
    );
  }

  protected onPath(value: unknown): void {
    this.path.set(typeof value === 'string' ? value : '');
  }

  protected onOperator(value: unknown): void {
    const match = this.operators.find((o) => o.value === value);
    this.operator.set(match?.value ?? 'contains');
  }

  protected add(): void {
    if (!this.canAdd()) {
      return;
    }
    this.store.addFilter({
      path: this.path().trim(),
      operator: this.operator(),
      value: this.needsValue() ? this.value().trim() : ''
    });
    // Done: the builder closes, ready for the next one, and focus goes
    // back to the button that opened it.
    this.builderOpen.set(false);
    this.path.set('');
    this.operator.set('contains');
    this.value.set('');
    this.focusAddFilter();
  }

  protected remove(id: string): void {
    this.store.removeFilter(id);
    this.focusAddFilter();
  }

  protected clearAll(): void {
    clearTimeout(this.searchTimer);
    this.store.clearFilters();
    this.focusAddFilter();
  }

  /** Focus to Add filter, as the control just used goes away. */
  private focusAddFilter(): void {
    afterNextRender(
      () =>
        (this.addFilterButton()?.nativeElement as HTMLElement | undefined)
          ?.querySelector('button')
          ?.focus(),
      { injector: this.injector }
    );
  }
}
