import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetryMonitor,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE, CpsDialogConfig } from 'cps-ui-kit';
import * as exportUtil from '../uwt-inspector-export/uwt-inspector-export';
import {
  UWT_INSPECTOR_FLUSH_MS,
  UwtInspectorStore
} from '../uwt-inspector-store/uwt-inspector-store';
import { UWT_INSPECTOR_PREFERENCES_KEY } from '../uwt-inspector-preferences/uwt-inspector-preferences';
import { UwtInspectorSession } from '../uwt-inspector-session/uwt-inspector-session';
import { UwtInspectorComponent } from './uwt-inspector.component';

const bi = (name: string, theme = 'dark'): UwtTelemetryPublishInput => ({
  kind: 'bi',
  eventType: 'com.uwt.bi',
  payload: {
    eventName: name,
    eventTime: '2026-01-01T00:00:00.000Z',
    application: 'app',
    metadata: { theme }
  },
  destination: 'sink',
  origin: { forwarded: false }
});

const scenario: UwtTelemetryPublishInput = {
  kind: 'scenario',
  eventType: 'com.uwt.scenario',
  payload: {
    scenarioId: 'abc',
    scenarioName: 'load-dashboard',
    status: 'success',
    startTime: '2026-01-01T00:00:00.000Z',
    delta: 42,
    elapsed: 1000,
    stepCount: 1,
    steps: [],
    application: 'app'
  },
  destination: 'sink',
  origin: { forwarded: false }
};

const warn: UwtTelemetryPublishInput = {
  kind: 'log',
  payload: {
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'warn',
    message: 'Careful now',
    logger: 'checkout',
    application: 'app',
    environment: 'test',
    version: '1'
  },
  destination: 'log-provider',
  origin: { forwarded: false }
};

describe('UwtInspectorComponent', () => {
  let fixture: ComponentFixture<UwtInspectorComponent>;
  let monitor: UwtTelemetryMonitor;
  let announce: jest.Mock;
  let dialogConfig: CpsDialogConfig;

  const el = () => fixture.nativeElement as HTMLElement;
  /** The popup's own actions, as its buttons and switch call them. */
  const ui = () =>
    fixture.componentInstance as unknown as {
      setPaused(paused: boolean): void;
      clear(): void;
    };
  /** A button found by the start of its accessible name. */
  const button = (name: string) => {
    const found = el().querySelector<HTMLButtonElement>(
      `button[aria-label^="${name}"]`
    );
    if (!found) {
      throw new Error(`No button named "${name}…"`);
    }
    return found;
  };
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const titles = () =>
    Array.from(
      el().querySelectorAll('[data-testid="cps-expansion-panel-title"]')
    ).map((t) => t.textContent?.trim());
  const bodyRows = () =>
    el().querySelectorAll('td.uwt-inspector-section__time').length;

  function settle(): void {
    jest.advanceTimersByTime(UWT_INSPECTOR_FLUSH_MS);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    announce = jest.fn();
    dialogConfig = {};
    await TestBed.configureTestingModule({
      imports: [UwtInspectorComponent, NoopAnimationsModule],
      providers: [
        {
          provide: UWT_TELEMETRY_IDENTITY,
          useValue: {
            application: 'app',
            environment: 'test',
            version: '1.0.0'
          }
        },
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useValue: { announce, clear: jest.fn() }
        },
        { provide: CpsDialogConfig, useValue: dialogConfig }
      ]
    }).compileComponents();
    monitor = TestBed.inject(UwtTelemetryMonitor);
    fixture = TestBed.createComponent(UwtInspectorComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    TestBed.inject(UwtInspectorSession).end();
    localStorage.removeItem(UWT_INSPECTOR_PREFERENCES_KEY);
  });

  it('should open empty, with three sections and an explanation', () => {
    expect(titles()).toEqual([
      'BI telemetry · no events yet',
      'Scenario telemetry · no events yet',
      'Logging · no events yet'
    ]);
    expect(text()).toContain('Capturing from now.');
    expect(text()).toContain('No BI events since this window opened.');
  });

  it('should show events live, in the right section, with the right columns', () => {
    monitor.publish(bi('theme_changed'));
    monitor.publish(scenario);
    monitor.publish(warn);
    settle();

    expect(bodyRows()).toBe(3);
    expect(titles()[0]).toMatch(/^BI telemetry · 1 · last \d\d:\d\d:\d\d$/);
    expect(text()).toContain('theme_changed');
    expect(text()).toContain('theme=dark');
    expect(text()).toContain('load-dashboard');
    expect(text()).toContain('42 ms');
    expect(text()).toContain('Careful now');
    expect(text()).toContain('3 events');
  });

  it('should mark the newest rows as new', () => {
    monitor.publish(bi('a'));
    settle();
    expect(
      el().querySelector('td.uwt-inspector-section__time cps-chip')
    ).not.toBeNull();
  });

  it('should show the full payload when a row is expanded', () => {
    monitor.publish(bi('theme_changed'));
    settle();

    (
      el().querySelector('button[aria-label="Expand row"]') as HTMLElement
    ).click();
    fixture.detectChanges();

    const pre = el().querySelector('pre');
    expect(pre?.getAttribute('aria-label')).toMatch(/^Payload of event #\d+$/);
    expect(JSON.parse(pre?.textContent ?? '')).toMatchObject({
      eventName: 'theme_changed',
      metadata: { theme: 'dark' }
    });
    expect(text()).toContain('telemetry sink');
  });

  it('should filter one section without touching the others', () => {
    monitor.publish(bi('theme_changed', 'dark'));
    monitor.publish(bi('sidebar_toggled', 'light'));
    monitor.publish(warn);
    settle();

    const search = el().querySelector(
      'input[aria-label="Search BI telemetry events"]'
    ) as HTMLInputElement;
    search.value = 'dark';
    search.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    fixture.detectChanges();

    expect(titles()[0]).toMatch(/^BI telemetry · 1 of 2/);
    // Logging has its own filters, still empty.
    expect(titles()[2]).toMatch(/^Logging · 1 · /);
    expect(text()).toContain('Careful now');
  });

  it('should give each section its own search field', () => {
    const labels = Array.from(
      el().querySelectorAll('.uwt-inspector-search input')
    ).map((i) => i.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Search BI telemetry events',
      'Search Scenario telemetry events',
      'Search Logging events'
    ]);
  });

  it('should clear history and keep capturing', () => {
    monitor.publish(bi('a'));
    settle();

    Array.from(el().querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Clear')
      ?.click();
    fixture.detectChanges();
    expect(bodyRows()).toBe(0);
    expect(announce).toHaveBeenCalledWith(
      'History cleared. Capturing continues.',
      'polite'
    );

    monitor.publish(bi('b'));
    settle();
    expect(bodyRows()).toBe(1);
  });

  it('should hold events back while paused, then show them on resume', () => {
    monitor.publish(bi('a'));
    settle();

    ui().setPaused(true);
    monitor.publish(bi('b'));
    settle();
    expect(bodyRows()).toBe(1);
    expect(text()).toContain('1 new event held back while paused.');

    ui().setPaused(false);
    fixture.detectChanges();
    expect(bodyRows()).toBe(2);
  });

  it("should download a section's own events, whatever its filters", () => {
    const download = jest
      .spyOn(exportUtil, 'uwtDownloadJson')
      .mockImplementation(() => undefined);
    monitor.publish(bi('a'));
    monitor.publish(bi('b'));
    monitor.publish(warn);
    settle();
    // A BI filter hiding one event must not remove it from BI's download.
    fixture.debugElement.injector
      .get(UwtInspectorStore)
      .setText('bi', 'nothing matches this');
    fixture.detectChanges();

    button('Download BI telemetry').click();

    expect(download).toHaveBeenCalledTimes(1);
    const [, filename, json] = download.mock.calls[0];
    expect(filename).toMatch(
      /^ngx-ui-watchtower-events-app-bi-\d{8}-\d{6}\.json$/
    );
    const doc = JSON.parse(json);
    expect(doc).toMatchObject({
      format: 'ngx-ui-watchtower-event-inspector',
      section: 'bi',
      app: { application: 'app' },
      count: { captured: 2, droppedOldest: 0 },
      activeFilters: { text: 'nothing matches this' }
    });
    expect(doc.events.map((e: { kind: string }) => e.kind)).toEqual([
      'bi',
      'bi'
    ]);

    button('Download Logging').click();
    const logging = JSON.parse(download.mock.calls[1][2]);
    expect(logging.section).toBe('logging');
    expect(logging.events.map((e: { kind: string }) => e.kind)).toEqual([
      'log'
    ]);
  });

  it("should copy a section's own events as JSON", async () => {
    const writeText = jest.fn((_text: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    monitor.publish(bi('a'));
    monitor.publish(warn);
    settle();

    button('Copy Logging').click();
    await Promise.resolve();

    const doc = JSON.parse(writeText.mock.calls[0][0]);
    expect(doc.section).toBe('logging');
    expect(doc.events).toHaveLength(1);
  });

  it('should announce new arrivals politely, at most every ten seconds', () => {
    monitor.publish(bi('a'));
    monitor.publish(bi('b'));
    monitor.publish(warn);
    settle();
    expect(announce).not.toHaveBeenCalled();

    jest.advanceTimersByTime(10_000);
    expect(announce).toHaveBeenCalledWith(
      '3 new events: 2 BI, 1 log.',
      'polite'
    );

    announce.mockClear();
    jest.advanceTimersByTime(10_000);
    expect(announce).not.toHaveBeenCalled(); // nothing new
  });

  it('should produce no telemetry of its own while being used', () => {
    const seen: unknown[] = [];
    // Subscribe as a second observer, alongside the popup's own store.
    monitor.events$.subscribe((e) => seen.push(e));

    ui().clear();
    ui().setPaused(true);
    ui().setPaused(false);
    jest
      .spyOn(exportUtil, 'uwtDownloadJson')
      .mockImplementation(() => undefined);
    button('Download BI telemetry').click();
    button('Download Logging').click();
    settle();

    expect(seen).toHaveLength(0);
  });

  it('should make the whole dialog see-through, and remember it', () => {
    expect(dialogConfig.style).toEqual({ opacity: '1' });

    const slider = el().querySelector('cps-slider input') as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));

    expect(dialogConfig.style).toEqual({ opacity: '0.7' });
    expect(
      JSON.parse(localStorage.getItem(UWT_INSPECTOR_PREFERENCES_KEY) ?? '{}')
        .transparency
    ).toBe(30);
  });

  it('should reopen at the remembered transparency', () => {
    localStorage.setItem(
      UWT_INSPECTOR_PREFERENCES_KEY,
      JSON.stringify({ transparency: 40 })
    );
    const reopened = TestBed.createComponent(UwtInspectorComponent);
    reopened.detectChanges();

    expect(dialogConfig.style).toEqual({ opacity: '0.6' });
    expect(
      (reopened.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        'cps-slider input'
      )?.value
    ).toBe('40');
    reopened.destroy();
  });

  it('should have the slider only as a dialog, and its own header elsewhere', () => {
    expect(el().querySelector('cps-slider')).not.toBeNull();
    expect(el().querySelector('.uwt-inspector__header')).toBeNull();

    fixture.componentRef.setInput('dock', 'right');
    fixture.detectChanges();

    expect(el().querySelector('cps-slider')).toBeNull();
    expect(el().querySelector('.uwt-inspector__title')?.textContent).toBe(
      'Event Inspector'
    );
    expect(button('Close Event Inspector')).toBeTruthy();
    expect(
      el().querySelector('.uwt-inspector__brand uwt-inspector-logo')
    ).not.toBeNull();
  });

  it("should put the mark in cps-dialog's header icon slot", () => {
    // Outside a cps-dialog, as in every other test, there is nowhere to put it.
    expect(el().querySelector('uwt-inspector-logo')).toBeNull();

    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.className = 'cps-dialog';
    const slot = dialog.appendChild(document.createElement('div'));
    slot.className = 'cps-dialog-header-icon';
    const inDialog = TestBed.createComponent(UwtInspectorComponent);
    dialog.appendChild(inDialog.nativeElement);
    inDialog.detectChanges();
    TestBed.tick();

    expect(slot.querySelector('uwt-inspector-logo')).not.toBeNull();
    inDialog.destroy();
    dialog.remove();
  });

  it('should ask to move to another dock, or to close', () => {
    const controls = { setDock: jest.fn(), close: jest.fn() };
    TestBed.inject(UwtInspectorSession).controls = controls;
    const dock = (name: string) =>
      el().querySelector<HTMLButtonElement>(`button[data-dock="${name}"]`)!;

    expect(dock('dialog').getAttribute('aria-pressed')).toBe('true');
    dock('dialog').click();
    dock('right').click();
    expect(controls.setDock.mock.calls).toEqual([['right']]);

    fixture.componentRef.setInput('dock', 'window');
    fixture.detectChanges();
    button('Close Event Inspector').click();
    expect(controls.close).toHaveBeenCalledTimes(1);
  });

  it('should keep its history in the session, for the next dock', () => {
    monitor.publish(bi('theme_changed'));
    settle();
    fixture.destroy();
    expect(monitor.observed).toBe(true);

    fixture = TestBed.createComponent(UwtInspectorComponent);
    fixture.detectChanges();
    expect(text()).toContain('1 event');

    TestBed.inject(UwtInspectorSession).end();
    expect(monitor.observed).toBe(false);
  });
});
