import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { UWT_TELEMETRY_IDENTITY } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorSession } from '../uwt-inspector-session/uwt-inspector-session';
import {
  UWT_INSPECTOR_WINDOW_NAME,
  uwtOpenInspectorWindow,
  UwtInspectorWindowOptions
} from './uwt-inspector-window';

/** A popup window: an iframe's real window, its geometry pinned. */
function fakePopup() {
  const frame = document.body.appendChild(document.createElement('iframe'));
  const popup = frame.contentWindow as Window & typeof globalThis;
  const doc = popup.document;
  doc.head.innerHTML = '<style>.stale {}</style>';
  const geometry = {
    innerWidth: 900,
    innerHeight: 700,
    screenX: 5,
    screenY: 6
  };
  for (const [name, value] of Object.entries(geometry)) {
    Object.defineProperty(popup, name, { value, configurable: true });
  }
  jest.spyOn(popup, 'focus').mockImplementation(() => undefined);
  jest.spyOn(popup, 'close').mockImplementation(() => undefined);
  // A spy that still removes, through the real window: the popup the code
  // sees is a proxy, which a window's own methods would not accept as `this`.
  const remove = popup.removeEventListener.bind(popup);
  jest
    .spyOn(popup, 'removeEventListener')
    .mockImplementation((type, listener, options) =>
      remove(type, listener, options)
    );
  // What a browser does to a window: a reload gives it a new document, and
  // closing it makes it `closed`. Everything else is the iframe's window.
  let current: Document = doc;
  let closed = false;
  const shown = new Proxy(popup, {
    get(target, name) {
      if (name === 'document') {
        return current;
      }
      if (name === 'closed') {
        return closed;
      }
      const value = Reflect.get(target, name, target);
      // The spies are the test's to see; any other method is the window's.
      return typeof value === 'function' && !jest.isMockFunction(value)
        ? value.bind(target)
        : value;
    }
  });
  return {
    popup: shown,
    doc,
    fire: (type: string) => popup.dispatchEvent(new popup.Event(type)),
    key: () =>
      current.body.dispatchEvent(
        new popup.KeyboardEvent('keydown', { bubbles: true })
      ),
    /** The page hides, and a new, empty document takes its place. */
    reload: () => {
      popup.dispatchEvent(new popup.Event('pagehide'));
      // A document with a window of its own, as a browser's is.
      current = document.body.appendChild(
        document.createElement('iframe')
      ).contentDocument!;
      return current;
    },
    /** The page hides, and the window goes. */
    close: () => {
      popup.dispatchEvent(new popup.Event('pagehide'));
      closed = true;
    }
  };
}

describe('uwtOpenInspectorWindow', () => {
  let options: UwtInspectorWindowOptions;
  let appStyle: HTMLStyleElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        {
          provide: UWT_TELEMETRY_IDENTITY,
          useValue: { application: 'shop', environment: 'test', version: '1' }
        }
      ]
    });
    appStyle = document.head.appendChild(document.createElement('style'));
    appStyle.textContent = '.app {}';
    options = {
      document,
      environment: TestBed.inject(EnvironmentInjector),
      appRef: TestBed.inject(ApplicationRef),
      title: 'Event Inspector · shop',
      onClosed: jest.fn(),
      onReloaded: jest.fn(),
      onKeydown: jest.fn(),
      onGeometry: jest.fn()
    };
  });

  afterEach(() => {
    appStyle.remove();
    document.querySelectorAll('iframe').forEach((frame) => frame.remove());
    TestBed.inject(UwtInspectorSession).end();
    jest.restoreAllMocks();
  });

  it('should open the named window, titled, with the app styles, showing the inspector', () => {
    const { popup, doc } = fakePopup();
    const open = jest.spyOn(window, 'open').mockReturnValue(popup);

    const host = uwtOpenInspectorWindow(options);

    expect(host?.dock).toBe('window');
    expect(open).toHaveBeenCalledWith(
      '',
      UWT_INSPECTOR_WINDOW_NAME,
      expect.stringMatching(/^popup,width=\d+,height=\d+$/)
    );
    expect(doc.title).toBe('Event Inspector · shop');
    const icon = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon?.type).toBe('image/svg+xml');
    expect(decodeURIComponent(icon?.href ?? '')).toMatch(
      /^data:image\/svg\+xml,<svg xmlns="http:\/\/www.w3.org\/2000\/svg".*<\/svg>$/
    );
    expect(doc.head.textContent).toContain('.app {}');
    expect(doc.head.textContent).not.toContain('.stale');
    expect(doc.querySelector('.uwt-inspector__title')?.textContent).toBe(
      'Event Inspector'
    );
    expect(
      doc.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')
    ).toBe('Separate window');
    host?.destroy();
  });

  it('should keep the window in step as the app adds and removes styles', async () => {
    const { popup, doc } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    const later = document.head.appendChild(document.createElement('style'));
    later.textContent = '.later {}';
    await Promise.resolve();
    expect(doc.head.textContent).toContain('.later {}');

    later.remove();
    await Promise.resolve();
    expect(doc.head.textContent).not.toContain('.later {}');
    host?.destroy();
  });

  it('should open where it was last', () => {
    const { popup } = fakePopup();
    const open = jest.spyOn(window, 'open').mockReturnValue(popup);

    uwtOpenInspectorWindow({
      ...options,
      geometry: { width: 800, height: 600, left: 10, top: 20 }
    })?.destroy();

    expect(open.mock.calls[0][2]).toMatch(/,left=10,top=20$/);
  });

  it('should pass on key presses, and report its closing with its geometry', () => {
    jest.useFakeTimers();
    const { popup, close, key } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    key();
    expect(options.onKeydown).toHaveBeenCalledTimes(1);

    close();
    expect(options.onGeometry).toHaveBeenCalledWith({
      width: 900,
      height: 700,
      left: 5,
      top: 6
    });
    // A reload hides the page too, so the window is looked at once it settles.
    jest.advanceTimersByTime(100);
    expect(options.onClosed).toHaveBeenCalledTimes(1);
    expect(options.onReloaded).not.toHaveBeenCalled();

    host?.destroy();
    expect(options.onGeometry).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('should stay open, showing the inspector again, when the window is reloaded', () => {
    jest.useFakeTimers();
    const { popup, reload, key } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    const doc = reload();
    // Reported before the inspector is drawn again, for a fresh one.
    let drawnWhenReported: boolean | undefined;
    jest.mocked(options.onReloaded).mockImplementation(() => {
      drawnWhenReported = !!doc.querySelector('.uwt-inspector__title');
    });
    jest.advanceTimersByTime(100);

    expect(options.onClosed).not.toHaveBeenCalled();
    expect(options.onReloaded).toHaveBeenCalledTimes(1);
    expect(drawnWhenReported).toBe(false);
    expect(doc.title).toBe('Event Inspector · shop');
    expect(doc.head.textContent).toContain('.app {}');
    expect(doc.querySelector('.uwt-inspector__title')?.textContent).toBe(
      'Event Inspector'
    );
    expect(doc.querySelector('link[rel="icon"]')).not.toBeNull();
    key();
    expect(options.onKeydown).toHaveBeenCalledTimes(1);
    host?.destroy();
    jest.useRealTimers();
  });

  it('should keep the geometry of the window it shows again, for when it closes', () => {
    jest.useFakeTimers();
    const { popup, reload } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    reload();
    jest.advanceTimersByTime(100);
    expect(options.onGeometry).toHaveBeenCalledTimes(1);

    host?.destroy();
    expect(options.onGeometry).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it('should report its closing when the window never comes back', () => {
    jest.useFakeTimers();
    const { popup, fire } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    fire('pagehide');
    // The inspector has timers of its own: the wait is advanced, not run out.
    jest.advanceTimersByTime(5000);

    expect(options.onClosed).toHaveBeenCalledTimes(1);
    host?.destroy();
    jest.useRealTimers();
  });

  it('should close the window again when it fails to show the inspector', () => {
    const { popup } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    jest.spyOn(options.appRef, 'attachView').mockImplementationOnce(() => {
      throw new Error('no kit');
    });

    expect(() => uwtOpenInspectorWindow(options)).toThrow('no kit');
    expect(popup.close).toHaveBeenCalled();
  });

  it('should close the window quietly when the app is destroyed first', () => {
    const { popup } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);
    const warn = jest.spyOn(console, 'warn');

    TestBed.resetTestingModule();
    host?.destroy();

    expect(popup.close).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('should close the window, and stop listening, when destroyed', () => {
    const { popup, key } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);

    uwtOpenInspectorWindow(options)?.destroy();

    expect(popup.close).toHaveBeenCalled();
    expect(popup.removeEventListener).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function)
    );
    expect(options.onGeometry).toHaveBeenCalledTimes(1);
    key();
    expect(options.onKeydown).not.toHaveBeenCalled();
  });

  it('should give up when the browser blocks the window', () => {
    jest.spyOn(window, 'open').mockReturnValue(null);

    expect(uwtOpenInspectorWindow(options)).toBeUndefined();
  });
});
