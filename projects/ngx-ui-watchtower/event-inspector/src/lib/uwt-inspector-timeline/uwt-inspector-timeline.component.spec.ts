import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UwtTelemetryMonitor } from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE } from 'cps-ui-kit';
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
  let announce: jest.Mock;

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
    announce = jest.fn();
    await TestBed.configureTestingModule({
      imports: [UwtInspectorTimelineComponent, NoopAnimationsModule],
      providers: [
        UwtInspectorStore,
        UwtInspectorExporter,
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useValue: { announce, clear: jest.fn() }
        }
      ]
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

    const newest = Array.from(el().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Go to newest'
    )!;
    newest.focus();
    newest.click();
    fixture.detectChanges();
    TestBed.tick();
    expect(ui().first()).toBe(0);
    // Its notice gone, focus is on the newest event, not the page.
    expect(document.activeElement?.getAttribute('data-testid')).toMatch(
      /^cps-table-row-expand-btn-/
    );
  });

  it('should count every event that arrived above the page since leaving the first', () => {
    publish(100);
    goToPage(2);

    publish(1);
    publish(1);
    publish(1);
    jest.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(el().textContent).toContain('3 new at the top of the list.');
  });

  describe('an open row', () => {
    const origin = { forwarded: false as const };
    const detail = (sequence: number) =>
      el().querySelector(
        `[data-testid="cps-table-row-expanded-content-${sequence}"]`
      );
    /** A button in an open row, found by its text. */
    const buttonIn = (sequence: number, text: string) =>
      Array.from(detail(sequence)?.querySelectorAll('button') ?? []).find(
        (b) => b.textContent?.trim() === text
      );

    function open(sequence: number): void {
      el()
        .querySelector<HTMLElement>(
          `[data-testid="cps-table-row-expand-btn-${sequence}"]`
        )
        ?.click();
      fixture.detectChanges();
    }

    function settle(): void {
      jest.advanceTimersByTime(UWT_INSPECTOR_FLUSH_MS);
      fixture.detectChanges();
    }

    /** A log error, 30 more log lines, then the error mirroring it to RUM. */
    function mirror(): { log: number; error: number } {
      const log = monitor.publish({
        kind: 'log',
        payload: {
          timestamp: '',
          level: 'error',
          message: 'Payment failed',
          application: 'app',
          environment: 'test',
          version: '1'
        },
        destination: 'log-provider',
        origin
      })!;
      publish(30, 'log');
      const error = monitor.publish({
        kind: 'error',
        payload: { name: 'Error', message: 'Payment failed' },
        relatedSequence: log,
        destination: 'sink',
        origin
      })!;
      settle();
      return { log, error };
    }

    it('should keep an open row, and the focus in it, as events arrive', () => {
      publish(1);
      const [{ event }] = store.filtered();
      open(event.sequence);
      const button = buttonIn(event.sequence, 'Event name: needle')!;
      button.focus();

      publish(1);

      expect(button.isConnected).toBe(true);
      expect(document.activeElement).toBe(button);
    });

    it('should filter by one of its values, once', () => {
      publish(1);
      const [{ event }] = store.filtered();
      open(event.sequence);

      buttonIn(event.sequence, 'Event name: needle')?.click();
      fixture.detectChanges();
      buttonIn(event.sequence, 'Event name: needle')?.click();

      expect(store.filters().fields).toEqual([
        expect.objectContaining({
          path: 'eventName',
          operator: 'equals',
          value: 'needle'
        })
      ]);
    });

    it('should take an error to its log event, open on its page, and back', () => {
      const { log, error } = mirror();
      open(error);

      buttonIn(error, `log event #${log}`)?.click();
      fixture.detectChanges();
      TestBed.tick();

      expect(ui().first()).toBe(PAGE);
      expect(detail(log)).not.toBeNull();
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        `Payload of event #${log}`
      );

      buttonIn(log, `event #${error}`)?.click();
      fixture.detectChanges();
      TestBed.tick();
      expect(ui().first()).toBe(0);
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        `Payload of event #${error}`
      );
    });

    it('should clear the filters hiding the log event, and say so', () => {
      const { log, error } = mirror();
      store.addFilter({ path: 'kind', operator: 'equals', value: 'error' });
      fixture.detectChanges();
      open(error);

      buttonIn(error, `log event #${log}`)?.click();
      fixture.detectChanges();

      expect(store.filters().fields).toHaveLength(0);
      expect(detail(log)).not.toBeNull();
      expect(announce).toHaveBeenCalledWith(
        `Filters cleared to show event #${log}.`,
        'polite'
      );
    });

    it('should name a log event it no longer has, without a link', () => {
      const error = monitor.publish({
        kind: 'error',
        payload: { name: 'Error', message: 'Payment failed' },
        relatedSequence: 999,
        destination: 'sink',
        origin
      })!;
      settle();
      open(error);

      expect(detail(error)?.textContent).toContain('log event #999');
      expect(buttonIn(error, 'log event #999')).toBeUndefined();
    });
  });
});
