import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Subject } from 'rxjs';
import {
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetryMonitor
} from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE, CpsDialogService } from 'cps-ui-kit';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig
} from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorComponent } from '../uwt-inspector/uwt-inspector.component';
import { UWT_INSPECTOR_PREFERENCES_KEY } from '../uwt-inspector-preferences/uwt-inspector-preferences';
import { UwtInspectorSession } from '../uwt-inspector-session/uwt-inspector-session';
import * as windowHost from '../uwt-inspector-window/uwt-inspector-window';
import { UwtInspectorRing } from '../uwt-inspector-ring/uwt-inspector-ring';
import { UwtEventInspectorService } from './uwt-event-inspector.service';

/** Stands in for CpsDialogService, recording what was opened. */
class FakeDialogs {
  readonly opened: { component: unknown; config: Record<string, unknown> }[] =
    [];

  readonly destroyed = new Subject<void>();
  containsFocus = false;
  readonly instance = {
    containsFocus: () => this.containsFocus,
    focusSearch: jest.fn()
  };

  readonly close = jest.fn(() => this.destroyed.next());

  open(component: unknown, config: Record<string, unknown>) {
    this.opened.push({ component, config });
    return {
      componentInstance: this.instance,
      onDestroy: this.destroyed.asObservable(),
      close: this.close
    };
  }
}

type KeyInit = ConstructorParameters<typeof KeyboardEvent>[1];

/** Presses one key on `target`; with none given, the default Shift+E+I. */
function press(init?: KeyInit, target: Element = document.body): KeyboardEvent {
  if (!init) {
    press({ code: 'KeyE', key: 'E', shiftKey: true }, target);
    return press({ code: 'KeyI', key: 'I', shiftKey: true }, target);
  }
  const event = new KeyboardEvent('keydown', {
    ...init,
    bubbles: true,
    cancelable: true,
    composed: true
  });
  target.dispatchEvent(event);
  return event;
}

describe('UwtEventInspectorService', () => {
  let dialogs: FakeDialogs;

  function create(
    config: Partial<UwtEventInspectorConfig> = {},
    platform = 'browser'
  ): UwtEventInspectorService {
    TestBed.resetTestingModule();
    dialogs = new FakeDialogs();
    TestBed.configureTestingModule({
      providers: [
        { provide: CpsDialogService, useValue: dialogs },
        { provide: PLATFORM_ID, useValue: platform },
        { provide: UWT_EVENT_INSPECTOR_CONFIG, useValue: config },
        {
          provide: UWT_TELEMETRY_IDENTITY,
          useValue: { application: 'shop', environment: 'test', version: '1' }
        },
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useValue: { announce: jest.fn(), clear: jest.fn() }
        },
        provideNoopAnimations()
      ]
    });
    return TestBed.inject(UwtEventInspectorService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    jest.restoreAllMocks();
    localStorage.removeItem(UWT_INSPECTOR_PREFERENCES_KEY);
  });

  const pane = () => document.querySelector('uwt-inspector-pane');
  const remember = (preferences: object) =>
    localStorage.setItem(
      UWT_INSPECTOR_PREFERENCES_KEY,
      JSON.stringify(preferences)
    );
  const stored = () =>
    JSON.parse(localStorage.getItem(UWT_INSPECTOR_PREFERENCES_KEY) ?? '{}');
  /** A stand-in window host, recording what the service asked of it. */
  function fakeWindow() {
    const host = {
      dock: 'window' as const,
      focus: jest.fn(),
      containsFocus: jest.fn(() => false),
      destroy: jest.fn()
    };
    const open = jest
      .spyOn(windowHost, 'uwtOpenInspectorWindow')
      .mockReturnValue(host);
    return { host, open };
  }

  it('should open the popup, non-modal and named, on the default shortcut', () => {
    create().install();

    const event = press();

    expect(dialogs.opened).toHaveLength(1);
    expect(dialogs.opened[0].component).toBe(UwtInspectorComponent);
    expect(dialogs.opened[0].config).toMatchObject({
      modal: false,
      ariaLabel: 'Event Inspector',
      closeOnEscape: true,
      styleClass: 'uwt-inspector-dialog'
    });
    expect(event.defaultPrevented).toBe(true);
    expect(TestBed.inject(UwtEventInspectorService).isOpen()).toBe(true);
  });

  it('should ignore ordinary typing and near misses', () => {
    create().install();

    press({ code: 'KeyI', shiftKey: true });
    press({ code: 'KeyE' });
    press({ code: 'ShiftLeft', shiftKey: true });
    press({ code: 'KeyI', shiftKey: true });
    press({ code: 'KeyE', shiftKey: true });
    press({ code: 'KeyX', shiftKey: true });
    press({ code: 'KeyI', shiftKey: true });

    expect(dialogs.opened).toHaveLength(0);
  });

  it('should ignore Shift+E+I typed into a text field', () => {
    create().install();
    const field = document.body.appendChild(document.createElement('input'));

    press(undefined, field);

    expect(dialogs.opened).toHaveLength(0);
    field.remove();
  });

  it('should ignore Shift+E+I typed into a text field inside a shadow root', () => {
    create().install();
    const host = document.body.appendChild(document.createElement('div'));
    const field = host
      .attachShadow({ mode: 'open' })
      .appendChild(document.createElement('input'));

    press(undefined, field);

    expect(dialogs.opened).toHaveLength(0);
    host.remove();
  });

  it('should bring focus back to an open popup, and close it from inside', () => {
    create().install();
    press();
    dialogs.instance.focusSearch.mockClear();

    dialogs.containsFocus = false;
    press();
    expect(dialogs.instance.focusSearch).toHaveBeenCalledTimes(1);
    expect(dialogs.close).not.toHaveBeenCalled();

    dialogs.containsFocus = true;
    press();
    expect(dialogs.close).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(UwtEventInspectorService).isOpen()).toBe(false);
  });

  it('should open fresh after the previous popup was destroyed', () => {
    create().install();
    press();
    dialogs.destroyed.next();

    press();
    expect(dialogs.opened).toHaveLength(2);
  });

  it('should use custom shortcuts instead of the defaults', () => {
    create({
      shortcuts: [{ code: 'KeyD', ctrl: true, alt: true, shift: true }]
    }).install();

    press();
    expect(dialogs.opened).toHaveLength(0);
    press({ code: 'KeyD', ctrlKey: true, altKey: true, shiftKey: true });
    expect(dialogs.opened).toHaveLength(1);
  });

  it('should not listen with no shortcuts, but still open on request', () => {
    const service = create({ shortcuts: [] });
    service.install();

    press();
    expect(dialogs.opened).toHaveLength(0);

    service.open();
    expect(dialogs.opened).toHaveLength(1);
  });

  it.each([
    ['disabled', { enabled: false }],
    ['disabled by a function', { enabled: () => false }]
  ])('should do nothing when %s', (_label, config) => {
    const service = create(config);
    service.install();

    press();
    service.open();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should treat a throwing enabled() as disabled', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = create({
      enabled: () => {
        throw new Error('auth not ready');
      }
    });
    service.install();
    service.open();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should not listen during a server-side render', () => {
    create({}, 'server').install();
    press();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should stop listening when the application is destroyed', () => {
    create().install();
    TestBed.resetTestingModule();

    press();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should open where it was last', () => {
    remember({ dock: 'right' });
    create().open();

    expect(dialogs.opened).toHaveLength(0);
    expect(pane()?.classList).toContain('uwt-inspector-pane--right');
  });

  it('should move between docks, keeping the session, and remember the dock', () => {
    const service = create();
    service.open();
    const store = TestBed.inject(UwtInspectorSession).store;

    service.setDock('left');

    expect(dialogs.close).toHaveBeenCalledTimes(1);
    expect(pane()?.classList).toContain('uwt-inspector-pane--left');
    expect(service.isOpen()).toBe(true);
    expect(TestBed.inject(UwtInspectorSession).store).toBe(store);
    expect(stored().dock).toBe('left');

    service.close();
    expect(pane()).toBeNull();
    expect(service.isOpen()).toBe(false);
    expect(TestBed.inject(UwtTelemetryMonitor).observed).toBe(false);
  });

  it('should open a window titled after the app, where it was last', () => {
    remember({ window: { width: 900, height: 700, left: 10, top: 20 } });
    const { host, open } = fakeWindow();
    const service = create();

    service.setDock('window');

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Event Inspector · shop',
        geometry: { width: 900, height: 700, left: 10, top: 20 }
      })
    );
    expect(host.focus).toHaveBeenCalled();
    expect(dialogs.opened).toHaveLength(0);
  });

  it('should end the session when the user closes the window', () => {
    const { host, open } = fakeWindow();
    const service = create();
    service.setDock('window');
    const options = open.mock.calls[0][0];

    options.onGeometry({ width: 800, height: 600, left: 1, top: 2 });
    options.onClosed();

    expect(service.isOpen()).toBe(false);
    expect(host.destroy).toHaveBeenCalled();
    expect(stored().window).toEqual({
      width: 800,
      height: 600,
      left: 1,
      top: 2
    });
  });

  it('should open a dialog, warning once, when the browser blocks the window', () => {
    jest.spyOn(windowHost, 'uwtOpenInspectorWindow').mockReturnValue(undefined);
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const service = create();

    service.setDock('window');
    service.close();
    service.setDock('window');

    expect(dialogs.opened).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(stored().dock).toBe('window');
  });

  it('should end the session when the user closes the dialog, but not on a move', () => {
    const service = create();
    service.open();
    service.setDock('bottom');
    expect(service.isOpen()).toBe(true);

    service.setDock('dialog');
    dialogs.destroyed.next();
    expect(service.isOpen()).toBe(false);
    expect(pane()).toBeNull();
  });

  it('should move focus into a pane it opens, so the shortcut closes it next', () => {
    remember({ dock: 'right' });
    const service = create();
    service.install();

    press();
    expect(pane()?.contains(document.activeElement)).toBe(true);

    press();
    expect(service.isOpen()).toBe(false);
  });

  it('should say where it is shown, which a blocked window makes a dialog', () => {
    const service = create();
    expect(service.dock()).toBeUndefined();

    service.setDock('left');
    expect(service.dock()).toBe('left');

    jest.spyOn(windowHost, 'uwtOpenInspectorWindow').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    service.setDock('window');
    expect(service.dock()).toBe('dialog');

    service.close();
    expect(service.dock()).toBeUndefined();
  });

  it('should leave the inspector as it is when asked for the dock it is in', () => {
    const service = create();
    service.setDock('right');
    const first = pane();

    service.setDock('right');

    expect(pane()).toBe(first);
    expect(document.querySelectorAll('uwt-inspector-pane')).toHaveLength(1);
    service.close();

    const { host, open } = fakeWindow();
    service.setDock('window');
    service.setDock('window');
    expect(open).toHaveBeenCalledTimes(1);
    expect(host.destroy).not.toHaveBeenCalled();
    expect(host.focus).toHaveBeenCalledTimes(2);
  });

  describe('captureBeforeOpen', () => {
    const bi = (name: string) => ({
      kind: 'bi' as const,
      eventType: 'com.uwt.bi',
      payload: { eventName: name, eventTime: '', application: 'shop' },
      destination: 'sink' as const,
      origin: { forwarded: false as const }
    });
    const monitor = () => TestBed.inject(UwtTelemetryMonitor);

    it('should keep events from before opening, even with no shortcut', () => {
      const service = create({ captureBeforeOpen: 5, shortcuts: [] });
      service.install();
      monitor().publish(bi('before'));

      service.open();
      expect(
        TestBed.inject(UwtInspectorSession).store.entries().bi
      ).toHaveLength(1);
    });

    it('should keep them coming after closing, for the next opening', () => {
      const service = create({ captureBeforeOpen: 5 });
      service.install();
      service.open();
      service.close();
      expect(monitor().observed).toBe(true);

      monitor().publish(bi('while closed'));
      service.open();
      expect(
        TestBed.inject(UwtInspectorSession).store.entries().bi
      ).toHaveLength(1);
    });

    it('should keep no more of each kind than the inspector shows', () => {
      create({ captureBeforeOpen: 50, maxEventsPerSection: 2 }).install();
      ['a', 'b', 'c'].forEach((n) => monitor().publish(bi(n)));

      expect(TestBed.inject(UwtInspectorRing).snapshot().events).toHaveLength(
        2
      );
    });

    it('should keep nothing by default, when disabled, or on the server', () => {
      create().install();
      expect(monitor().observed).toBe(false);

      create({ captureBeforeOpen: 5, enabled: false }).install();
      expect(monitor().observed).toBe(false);

      create({ captureBeforeOpen: 5 }, 'server').install();
      expect(monitor().observed).toBe(false);
    });
  });

  describe('on a screen too narrow for a pane', () => {
    let change: ((event: { matches: boolean }) => void) | undefined;
    /** Whether the app's window is narrower than 640px right now. */
    let narrow = false;

    /** The app's window, as `matchMedia` reports it: `narrow` when asked. */
    function screenIsNarrow(matches: boolean): void {
      narrow = matches;
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: jest.fn((query: string) => ({
          get matches() {
            return narrow;
          },
          media: query,
          addEventListener: (_: string, listener: typeof change) =>
            (change = listener),
          removeEventListener: jest.fn()
        }))
      });
    }

    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

    afterEach(() => {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      } else {
        delete (window as { matchMedia?: unknown }).matchMedia;
      }
      change = undefined;
    });

    it('should open a remembered pane as a dialog, keeping the pane for later', () => {
      screenIsNarrow(true);
      remember({ dock: 'right' });
      const service = create();

      service.open();

      expect(pane()).toBeNull();
      expect(dialogs.opened).toHaveLength(1);
      expect(stored().dock).toBe('right');
      service.close();
    });

    it('should go by the width when it opens, before a resize is reported', () => {
      screenIsNarrow(false);
      remember({ dock: 'right' });
      const service = create();

      narrow = true; // no change event yet
      service.open();

      expect(pane()).toBeNull();
      expect(dialogs.opened).toHaveLength(1);
      service.close();
    });

    it('should tell the inspector whether a pane fits, as the window is resized', () => {
      screenIsNarrow(false);
      create();
      const controls = TestBed.inject(UwtInspectorSession).controls;
      expect(window.matchMedia).toHaveBeenCalledWith('(width < 640px)');
      expect(controls?.panesFit()).toBe(true);

      change?.({ matches: true });
      expect(controls?.panesFit()).toBe(false);
    });
  });
});
