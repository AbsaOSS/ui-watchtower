import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UwtTelemetryMonitor } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorExporter } from '../uwt-inspector-export/uwt-inspector-exporter';
import {
  UWT_INSPECTOR_FLUSH_MS,
  UwtInspectorStore
} from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorTimelineComponent } from './uwt-inspector-timeline.component';

/** Rows per page, as the timeline's table is configured. */
const PAGE = 25;

describe('UwtInspectorTimelineComponent', () => {
  let fixture: ComponentFixture<UwtInspectorTimelineComponent>;
  let store: UwtInspectorStore;
  let monitor: UwtTelemetryMonitor;

  const el = () => fixture.nativeElement as HTMLElement;
  const shownRows = () =>
    el().querySelectorAll('td.uwt-inspector-timeline__time').length;
  /** Whether the paginator shows; the table hides it with one page. */
  const paginatorShown = () => {
    const paginator = el().querySelector<HTMLElement>('.p-paginator');
    return !!paginator && paginator.style.display !== 'none';
  };
  const ui = () =>
    fixture.componentInstance as unknown as {
      first(): number;
      onPage(state: { first?: number }): void;
    };

  /** Publishes events, every tenth one named `needle`: BI, or logs. */
  function publish(count: number, kind: 'bi' | 'log' = 'bi'): void {
    for (let i = 0; i < count; i++) {
      const name = i % 10 === 0 ? 'needle' : `hay-${i}`;
      monitor.publish(
        kind === 'bi'
          ? {
              kind: 'bi',
              eventType: 'com.uwt.bi',
              payload: {
                eventName: name,
                eventTime: '2026-01-01T00:00:00.000Z',
                application: 'app'
              },
              destination: 'sink',
              origin: { forwarded: false }
            }
          : {
              kind: 'log',
              payload: {
                timestamp: '2026-01-01T00:00:00.000Z',
                level: 'log',
                message: name,
                application: 'app',
                environment: 'test',
                version: '1'
              },
              destination: 'log-provider',
              origin: { forwarded: false }
            }
      );
    }
    jest.advanceTimersByTime(UWT_INSPECTOR_FLUSH_MS);
    fixture.detectChanges();
  }

  function goToPage(page: number): void {
    ui().onPage({ first: (page - 1) * PAGE });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [UwtInspectorTimelineComponent, NoopAnimationsModule],
      providers: [UwtInspectorStore, UwtInspectorExporter]
    }).compileComponents();
    monitor = TestBed.inject(UwtTelemetryMonitor);
    store = TestBed.inject(UwtInspectorStore);
    fixture = TestBed.createComponent(UwtInspectorTimelineComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jest.useRealTimers();
  });

  describe('paging', () => {
    it('should show the page the reader chose', () => {
      publish(100);
      goToPage(4);

      expect(ui().first()).toBe(75);
      expect(shownRows()).toBe(PAGE);
    });

    it('should stay on the page while new events arrive', () => {
      publish(100);
      goToPage(2);

      publish(1);

      expect(ui().first()).toBe(PAGE);
    });

    it('should go back to the first page when the filters change', () => {
      publish(100);
      goToPage(2);

      store.setText('hay');
      fixture.detectChanges();

      expect(ui().first()).toBe(0);
      expect(shownRows()).toBe(PAGE);
    });

    it('should go back to the first page when another kind is shown', () => {
      publish(60);
      publish(60, 'log');
      goToPage(2);

      store.setKind('logging');
      fixture.detectChanges();

      expect(ui().first()).toBe(0);
    });

    it('should go back to the first page when cleared', () => {
      publish(100);
      goToPage(3);

      store.clear();
      fixture.detectChanges();
      expect(ui().first()).toBe(0);

      publish(1);
      expect(shownRows()).toBe(1);
    });

    it('should hide the paginator while everything fits on one page', () => {
      publish(PAGE);
      expect(paginatorShown()).toBe(false);

      publish(1);
      expect(paginatorShown()).toBe(true);

      store.setText('needle');
      fixture.detectChanges();
      expect(shownRows()).toBe(4);
      expect(paginatorShown()).toBe(false);
    });
  });

  it('should offer to go back to the newest, from a later page', () => {
    publish(30);
    jest.advanceTimersByTime(3000); // no longer new
    goToPage(2);
    expect(el().textContent).not.toContain('new at the top');

    publish(2);
    expect(el().textContent).toContain('2 new at the top of the list.');

    // Of a burst reaching this page, only those above it count.
    publish(30);
    expect(el().textContent).toContain('25 new at the top of the list.');

    Array.from(el().querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Go to newest')
      ?.click();
    fixture.detectChanges();
    expect(ui().first()).toBe(0);
  });
});
