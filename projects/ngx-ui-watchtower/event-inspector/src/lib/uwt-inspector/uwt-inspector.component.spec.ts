import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetryMonitor,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import { Subject } from 'rxjs';
import {
  CPS_LIVE_ANNOUNCER_SERVICE,
  CpsDialogConfig,
  CpsDialogRef
} from 'cps-ui-kit';
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
  let maximize: Subject<boolean>;

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
  /** A button found by its visible text. */
  const labelled = (label: string) => {
    const found = Array.from(el().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label
    );
    if (!found) {
      throw new Error(`No button labelled "${label}"`);
    }
    return found;
  };
  const text = () => el().textContent?.replace(/\s+/g, ' ') ?? '';
  const kindOptions = () =>
    Array.from(
      el().querySelectorAll<HTMLInputElement>('cps-button-toggle input')
    );
  const kinds = () => kindOptions().map((i) => i.getAttribute('aria-label'));
  const bodyRows = () =>
    el().querySelectorAll('td.uwt-inspector-timeline__time').length;
  /** Each shown row's Kind cell, newest first. */
  const rowKinds = () =>
    Array.from(
      el().querySelectorAll('td.uwt-inspector-timeline__time + td')
    ).map((td) => td.textContent?.trim());

  /** Shows one kind, as choosing it in the kind toggle does. */
  function showKind(label: string): void {
    kindOptions()
      .find((i) => i.getAttribute('aria-label')?.startsWith(`${label} `))
      ?.click();
    fixture.detectChanges();
  }

  /** Opens the Export menu and chooses one of its items. */
  function exportAs(item: 'Copy JSON' | 'Download JSON'): void {
    labelled('Export').click();
    fixture.detectChanges();
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((i) => i.textContent?.includes(item))
      ?.click();
    fixture.detectChanges();
  }

  function settle(): void {
    jest.advanceTimersByTime(UWT_INSPECTOR_FLUSH_MS);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    announce = jest.fn();
    dialogConfig = {};
    maximize = new Subject<boolean>();
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
        { provide: CpsDialogConfig, useValue: dialogConfig },
        {
          provide: CpsDialogRef,
          useValue: { onMaximize: maximize.asObservable() }
        }
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

  it('should open empty, with every kind at nought and an explanation', () => {
    expect(kinds()).toEqual(['All 0', 'BI 0', 'Scenarios 0', 'Logs 0']);
    expect(text()).toContain('Use the app to generate events');
    expect(text()).toContain('No events yet.');
  });

  it('should show every kind live in one timeline, newest first', () => {
    monitor.publish(bi('theme_changed'));
    monitor.publish(scenario);
    monitor.publish(warn);
    settle();

    expect(rowKinds()).toEqual(['Log', 'Scenario', 'BI']);
    expect(kinds()).toEqual(['All 3', 'BI 1', 'Scenarios 1', 'Logs 1']);
    expect(text()).toContain('theme_changed');
    expect(text()).toContain('theme=dark');
    expect(text()).toContain('load-dashboard');
    expect(text()).toContain('success · 42 ms · 1 step');
    expect(text()).toContain('warn · Careful now');
    expect(text()).toContain('3 events');
  });

  it('should colour a status or level, with the word still written', () => {
    monitor.publish(scenario);
    monitor.publish(warn);
    settle();

    expect(
      el().querySelector('.uwt-inspector-timeline__tone--success')?.textContent
    ).toContain('success');
    expect(
      el().querySelector('.uwt-inspector-timeline__tone--warn')?.textContent
    ).toContain('warn');
  });

  it('should mark the newest rows as new, for eyes and for screen readers', () => {
    monitor.publish(bi('a'));
    settle();
    const fresh = el().querySelector('td.uwt-inspector-timeline__fresh');
    expect(fresh?.querySelector('.cps-sr-only')?.textContent).toBe('New: ');

    jest.advanceTimersByTime(3000);
    fixture.detectChanges();
    expect(el().querySelector('td.uwt-inspector-timeline__fresh')).toBeNull();
  });

  it('should count, list and say what is shown when only one kind is', () => {
    monitor.publish(bi('theme_changed'));
    monitor.publish(warn);
    settle();

    showKind('Logs');
    expect(rowKinds()).toEqual(['Log']);

    showKind('Scenarios');
    expect(bodyRows()).toBe(0);
    expect(text()).toContain('No scenario events yet.');
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

  it('should search every kind with one field, counting matches per kind', () => {
    monitor.publish(bi('theme_changed', 'dark'));
    monitor.publish(bi('sidebar_toggled', 'light'));
    monitor.publish(warn);
    settle();

    const searches = el().querySelectorAll<HTMLInputElement>(
      '.uwt-inspector-search input'
    );
    expect(searches).toHaveLength(1);
    expect(searches[0].getAttribute('aria-label')).toBe('Search events');
    searches[0].value = 'dark';
    searches[0].dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    fixture.detectChanges();

    expect(bodyRows()).toBe(1);
    expect(kinds()).toEqual(['All 1', 'BI 1', 'Scenarios 0', 'Logs 0']);

    showKind('Logs');
    expect(text()).toContain('No log events match the filters.');
  });

  it('should count the oldest events dropped to stay within the limit', () => {
    fixture.debugElement.injector
      .get(UwtInspectorStore)
      .dropped.set({ bi: 2, scenario: 0, logging: 1 });
    fixture.detectChanges();

    expect(text()).toContain('0 events · 3 oldest dropped');
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
    // Not a live region: its count changes with every event, and resuming
    // announces what arrived meanwhile.
    expect(
      el().querySelector('.uwt-inspector__paused')?.getAttribute('role')
    ).toBeNull();

    const resume = Array.from(el().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Resume'
    )!;
    resume.focus();
    resume.click();
    fixture.detectChanges();
    TestBed.tick();
    expect(bodyRows()).toBe(2);
    // The notice gone, focus is on the Pause switch, not the page.
    expect(document.activeElement).toBe(el().querySelector('cps-switch input'));
  });

  it('should say when it was paused, as well as when capturing began', () => {
    jest.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    ui().clear();
    jest.setSystemTime(new Date(2026, 0, 1, 10, 5, 30));
    ui().setPaused(true);
    fixture.detectChanges();
    expect(text()).toContain('Paused at 10:05:30 · capturing since 10:00:00 ·');

    ui().setPaused(false);
    fixture.detectChanges();
    expect(text()).toContain('Capturing since 10:00:00 ·');
    expect(text()).not.toContain('Paused at');
  });

  it('should export every event of the kind shown, whatever the filters', () => {
    const download = jest
      .spyOn(exportUtil, 'uwtDownloadJson')
      .mockImplementation(() => undefined);
    monitor.publish(bi('a'));
    monitor.publish(bi('b'));
    monitor.publish(warn);
    settle();
    // A search hiding every event must not remove any from the export.
    fixture.debugElement.injector
      .get(UwtInspectorStore)
      .setText('nothing matches this');
    fixture.detectChanges();

    exportAs('Download JSON');

    expect(download).toHaveBeenCalledTimes(1);
    const [, filename, json] = download.mock.calls[0];
    expect(filename).toMatch(
      /^ngx-ui-watchtower-events-app-all-\d{8}-\d{6}\.json$/
    );
    const doc = JSON.parse(json);
    expect(doc).toMatchObject({
      format: 'ngx-ui-watchtower-event-inspector',
      formatVersion: 2,
      section: 'all',
      app: { application: 'app' },
      count: { captured: 3, droppedOldest: 0 },
      activeFilters: { text: 'nothing matches this' }
    });
    expect(doc.events.map((e: { kind: string }) => e.kind)).toEqual([
      'bi',
      'bi',
      'log'
    ]);

    showKind('Logs');
    exportAs('Download JSON');
    const logging = JSON.parse(download.mock.calls[1][2]);
    expect(download.mock.calls[1][1]).toContain('-logging-');
    expect(logging.section).toBe('logging');
    expect(logging.events.map((e: { kind: string }) => e.kind)).toEqual([
      'log'
    ]);
  });

  it('should say in the Export menu what it holds', async () => {
    monitor.publish(bi('a'));
    monitor.publish(warn);
    settle();
    showKind('BI');

    labelled('Export').click();
    fixture.detectChanges();
    // The menu reports itself shown once its animation starts.
    await jest.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(
      document.querySelector('[role="menu"]')?.getAttribute('aria-label')
    ).toBe('1 BI event, with session and user ids');
    expect(labelled('Export').getAttribute('aria-expanded')).toBe('true');
  });

  it('should copy the kind shown as JSON, and say so on the button', async () => {
    const writeText = jest.fn((_text: string) => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    monitor.publish(bi('a'));
    monitor.publish(warn);
    settle();

    showKind('Logs');
    exportAs('Copy JSON');
    await jest.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    const doc = JSON.parse(writeText.mock.calls[0][0]);
    expect(doc.section).toBe('logging');
    expect(doc.events).toHaveLength(1);
    expect(labelled('Copied')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith(
      '1 log event copied as JSON.',
      'polite'
    );
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

  it('should announce no history after moving to another dock', () => {
    monitor.publish(bi('a'));
    monitor.publish(bi('b'));
    settle();
    // Another dock: a new view of the same session.
    fixture.destroy();
    const moved = TestBed.createComponent(UwtInspectorComponent);
    moved.detectChanges();

    jest.advanceTimersByTime(10_000);
    expect(announce).not.toHaveBeenCalled();
    moved.destroy();
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
    exportAs('Download JSON');
    showKind('Logs');
    exportAs('Download JSON');
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
      JSON.stringify({ transparency: 20 })
    );
    const reopened = TestBed.createComponent(UwtInspectorComponent);
    reopened.detectChanges();

    expect(dialogConfig.style).toEqual({ opacity: '0.8' });
    expect(
      (reopened.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        'cps-slider input'
      )?.value
    ).toBe('20');
    reopened.destroy();
  });

  it('should drop the transparency while maximized, and bring it back after', () => {
    const slider = el().querySelector('cps-slider input') as HTMLInputElement;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));

    maximize.next(true);
    fixture.detectChanges();
    expect(dialogConfig.style).toEqual({ opacity: '1' });
    expect(el().querySelector('cps-slider')).toBeNull();

    maximize.next(false);
    fixture.detectChanges();
    expect(dialogConfig.style).toEqual({ opacity: '0.7' });
    expect(el().querySelector('cps-slider')).not.toBeNull();
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
    const controls = {
      setDock: jest.fn(),
      close: jest.fn(),
      panesFit: signal(true)
    };
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

  it('should take focus itself, not to a field, where the shortcut types', () => {
    fixture.componentInstance.focusInspector();

    expect(document.activeElement).toBe(el());
    expect(el().tabIndex).toBe(-1);
  });

  it('should close the dialog on Escape from inside it, not while a list in it is open', () => {
    const controls = {
      setDock: jest.fn(),
      close: jest.fn(),
      panesFit: signal(true)
    };
    TestBed.inject(UwtInspectorSession).controls = controls;
    const search = el().querySelector('.uwt-inspector-search input')!;
    const escape = () =>
      search.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );

    search.setAttribute('aria-expanded', 'true');
    escape();
    expect(controls.close).not.toHaveBeenCalled();

    search.removeAttribute('aria-expanded');
    escape();
    expect(controls.close).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('dock', 'right');
    fixture.detectChanges();
    escape();
    expect(controls.close).toHaveBeenCalledTimes(1);
  });

  it('should mark an Escape it closes the dialog on as handled, and leave any other alone', () => {
    TestBed.inject(UwtInspectorSession).controls = {
      setDock: jest.fn(),
      close: jest.fn(),
      panesFit: signal(true)
    };
    const search = el().querySelector('.uwt-inspector-search input')!;
    const escape = () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
      });
      search.dispatchEvent(event);
      return event;
    };

    // The kit's notifications close on an Escape nobody handled.
    expect(escape().defaultPrevented).toBe(true);

    search.setAttribute('aria-expanded', 'true');
    expect(escape().defaultPrevented).toBe(false);

    search.removeAttribute('aria-expanded');
    fixture.componentRef.setInput('dock', 'right');
    fixture.detectChanges();
    expect(escape().defaultPrevented).toBe(false);
  });

  it('should offer no pane when the app has no room for one', () => {
    TestBed.inject(UwtInspectorSession).controls = {
      setDock: jest.fn(),
      close: jest.fn(),
      panesFit: signal(false)
    };
    const narrow = TestBed.createComponent(UwtInspectorComponent);
    narrow.detectChanges();

    expect(
      Array.from(
        (narrow.nativeElement as HTMLElement).querySelectorAll('[data-dock]')
      ).map((b) => b.getAttribute('data-dock'))
    ).toEqual(['dialog', 'window']);
    narrow.destroy();
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

  describe('page scroll', () => {
    /** What the kit's menus listen to: the body's own `scroll`. */
    const heard = () => {
      const listener = jest.fn();
      el()
        .querySelector('.uwt-inspector__body')!
        .addEventListener('scroll', listener);
      return listener;
    };

    it("should tell the page's scroll to its body, which the kit's open lists listen to", () => {
      const listener = heard();

      document.dispatchEvent(new Event('scroll'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should tell it a scrolling element's too, not only the window's", () => {
      const listener = heard();
      const scroller = document.body.appendChild(document.createElement('div'));

      scroller.dispatchEvent(new Event('scroll'));

      expect(listener).toHaveBeenCalledTimes(1);
      scroller.remove();
    });

    it('should leave scrolling inside the inspector to the kit, and not answer itself', () => {
      const listener = heard();

      el()
        .querySelector('.uwt-inspector__body')!
        .dispatchEvent(new Event('scroll'));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should leave an open list's own scrolling alone", () => {
      const listener = heard();
      const list = document.body.appendChild(document.createElement('div'));
      list.className = 'cps-menu-container';

      list.dispatchEvent(new Event('scroll'));

      expect(listener).not.toHaveBeenCalled();
      list.remove();
    });

    it('should stop once destroyed', () => {
      const listener = heard();
      fixture.destroy();

      document.dispatchEvent(new Event('scroll'));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('wheel', () => {
    const wheel = (
      target: Element,
      init: ConstructorParameters<typeof WheelEvent>[1] = { deltaY: 100 }
    ) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ...init
      });
      target.dispatchEvent(event);
      return event;
    };
    /** A part with `room` to scroll: `top` scrolled of `extent` in a `size` window. */
    const scrolling = (el: Element, top: number, extent = 400, size = 200) => {
      (el as HTMLElement).style.overflowY = 'auto';
      Object.defineProperties(el, {
        scrollTop: { value: top, configurable: true },
        clientHeight: { value: size, configurable: true },
        scrollHeight: { value: extent, configurable: true }
      });
    };
    const body = () => el().querySelector('.uwt-inspector__body')!;

    it('should keep the wheel from the page where nothing in the inspector scrolls', () => {
      fixture.componentRef.setInput('dock', 'right');
      fixture.detectChanges();

      expect(wheel(body()).defaultPrevented).toBe(true);
      expect(
        wheel(el().querySelector('.uwt-inspector__header')!).defaultPrevented
      ).toBe(true);
    });

    it('should let a part scroll while it has room, either way', () => {
      scrolling(body(), 100);

      expect(wheel(body(), { deltaY: 100 }).defaultPrevented).toBe(false);
      expect(wheel(body(), { deltaY: -100 }).defaultPrevented).toBe(false);
    });

    it('should keep it from the page once the part is at its end', () => {
      scrolling(body(), 200);
      expect(wheel(body(), { deltaY: 100 }).defaultPrevented).toBe(true);

      scrolling(body(), 0);
      expect(wheel(body(), { deltaY: -100 }).defaultPrevented).toBe(true);
    });

    it('should let a scrolling parent have it when what is inside is at its end', () => {
      scrolling(body(), 100);
      const inner = body().appendChild(document.createElement('div'));
      scrolling(inner, 200);

      expect(wheel(inner, { deltaY: 100 }).defaultPrevented).toBe(false);
    });

    it('should leave a pinch zoom, and a wheel already handled, alone', () => {
      expect(
        wheel(body(), { deltaY: 100, ctrlKey: true }).defaultPrevented
      ).toBe(false);
      body().addEventListener('wheel', (e) => e.preventDefault(), {
        once: true
      });
      const event = wheel(body());
      expect(event.defaultPrevented).toBe(true);
    });

    it('should stop once destroyed', () => {
      const target = body();
      fixture.destroy();

      expect(wheel(target).defaultPrevented).toBe(false);
    });
  });

  describe('dock menu', () => {
    const original = window.ResizeObserver;
    let resize: (width: number) => void;
    const trigger = () => el().querySelector('.uwt-inspector-dock__trigger');
    const group = () => el().querySelector('.uwt-inspector-dock__group');

    /** Opens the inspector in `dock`, with a ResizeObserver to drive. */
    const open = async (dock: 'right' | 'window') => {
      fixture.destroy();
      // cps-ui-kit observes things too: only what watches the inspector drives.
      type Callback = ConstructorParameters<typeof ResizeObserver>[0];
      window.ResizeObserver = class {
        private readonly callback: Callback;

        constructor(callback: Callback) {
          this.callback = callback;
        }

        observe(target: Element): void {
          if (target === fixture.nativeElement) {
            resize = (width) =>
              this.callback(
                [{ contentRect: { width } } as ResizeObserverEntry],
                this as unknown as ResizeObserver
              );
          }
        }

        disconnect(): void {}
      } as unknown as typeof ResizeObserver;
      fixture = TestBed.createComponent(UwtInspectorComponent);
      fixture.componentRef.setInput('dock', dock);
      fixture.detectChanges();
      // Observing starts after the first render, a tick on. (whenStable
      // would wait for the inspector's interval.)
      await new Promise<void>((resolve) =>
        jest.requireActual('timers').setImmediate(resolve)
      );
    };

    beforeEach(() => {
      // The change is made on the next frame: here, at once.
      jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((frame) => {
          frame(0);
          return 0;
        });
    });

    afterEach(() => {
      window.ResizeObserver = original;
      jest.restoreAllMocks();
    });

    it('should swap the dock buttons for a menu in a pane narrower than 34rem, and back', async () => {
      await open('right');
      expect(group()).not.toBeNull();

      resize(479);
      fixture.detectChanges();
      expect(trigger()).not.toBeNull();
      expect(group()).toBeNull();

      resize(576);
      fixture.detectChanges();
      expect(trigger()).toBeNull();
      expect(group()).not.toBeNull();
    });

    it('should keep the buttons in the separate window, however narrow', async () => {
      await open('window');

      resize(300);
      fixture.detectChanges();

      expect(trigger()).toBeNull();
      expect(group()).not.toBeNull();
    });
  });
});
