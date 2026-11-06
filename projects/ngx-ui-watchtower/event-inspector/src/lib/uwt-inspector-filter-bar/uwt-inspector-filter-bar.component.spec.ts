import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UwtInspectorStore } from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorFilterBarComponent } from './uwt-inspector-filter-bar.component';

describe('UwtInspectorFilterBarComponent', () => {
  let fixture: ComponentFixture<UwtInspectorFilterBarComponent>;
  let store: UwtInspectorStore;
  const bar = () =>
    fixture.componentInstance as unknown as {
      builderOpen: { (): boolean; set(v: boolean): void };
      onPath(v: unknown): void;
      onOperator(v: unknown): void;
      value: { set(v: string): void };
      add(): void;
      canAdd(): boolean;
      pathOptions(): {
        label: string;
        value: string;
        info: string;
        alias: string;
      }[];
    };
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UwtInspectorFilterBarComponent, NoopAnimationsModule],
      providers: [UwtInspectorStore]
    }).compileComponents();
    store = TestBed.inject(UwtInspectorStore);
    fixture = TestBed.createComponent(UwtInspectorFilterBarComponent);
    fixture.detectChanges();
  });

  it('should offer fields by name, with the path below, found by either', () => {
    expect(bar().pathOptions()).toContainEqual({
      label: 'Forwarded from',
      value: 'origin.application',
      info: 'origin.application',
      alias: 'origin.application'
    });
    expect(bar().pathOptions()).toContainEqual({
      label: 'Time handed over',
      value: 'capturedAt',
      info: 'capturedAt',
      alias: 'capturedAt'
    });
  });

  it('should close after adding, ready for the next, with focus back on Add filter', () => {
    bar().builderOpen.set(true);
    fixture.detectChanges();
    bar().onPath('kind');
    bar().onOperator('exists');
    bar().add();
    fixture.detectChanges();
    TestBed.tick();

    expect(bar().builderOpen()).toBe(false);
    expect(el().querySelector('[aria-label="New filter"]')).toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe('Add filter');

    bar().builderOpen.set(true);
    fixture.detectChanges();
    expect(bar().canAdd()).toBe(false); // nothing carried over
  });

  it('should explain how filters work beside the builder', () => {
    expect(el().querySelector('details')).toBeNull();
    bar().builderOpen.set(true);
    fixture.detectChanges();

    const help = el().querySelector('details');
    expect(help?.querySelector('summary')?.textContent).toBe(
      'How filters work'
    );
    // Not inside the fields' group, where Enter adds the filter.
    expect(help?.closest('[aria-label="New filter"]')).toBeNull();
  });

  it('should need a field, and a value unless checking presence', () => {
    bar().builderOpen.set(true);
    fixture.detectChanges();
    expect(bar().canAdd()).toBe(false);

    bar().onPath('metadata.theme');
    expect(bar().canAdd()).toBe(false);
    bar().value.set('dark');
    expect(bar().canAdd()).toBe(true);

    bar().value.set('');
    bar().onOperator('exists');
    expect(bar().canAdd()).toBe(true);
  });

  it('should name its search field', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el
        .querySelector('.uwt-inspector-search input')
        ?.getAttribute('aria-label')
    ).toBe('Search events');
  });

  it('should add a filter as a removable chip with a spoken name', () => {
    bar().onPath('metadata.theme');
    bar().onOperator('equals');
    bar().value.set('dark');
    bar().add();
    fixture.detectChanges();

    expect(store.filters().fields).toEqual([
      expect.objectContaining({
        path: 'metadata.theme',
        operator: 'equals',
        value: 'dark'
      })
    ]);
    const close = fixture.nativeElement.querySelector(
      'cps-chip button'
    ) as HTMLButtonElement;
    expect(close.getAttribute('aria-label')).toBe(
      'Remove filter metadata.theme equals "dark"'
    );

    close.click();
    fixture.detectChanges();
    expect(store.filters().fields).toHaveLength(0);
  });

  it('should clear the text and every filter together', () => {
    store.setText('x');
    store.addFilter({ path: 'kind', operator: 'exists', value: '' });
    fixture.detectChanges();

    const clearBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).find((b) => b.textContent?.trim() === 'Clear filters');
    clearBtn?.click();

    expect(store.filters()).toEqual({ text: '', fields: [] });
  });
});
