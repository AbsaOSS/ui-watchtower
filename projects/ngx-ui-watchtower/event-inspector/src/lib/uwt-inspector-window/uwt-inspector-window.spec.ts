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
  jest.spyOn(popup, 'removeEventListener');
  return {
    popup,
    doc,
    fire: (type: string) => popup.dispatchEvent(new popup.Event(type)),
    key: () =>
      doc.body.dispatchEvent(
        new popup.KeyboardEvent('keydown', { bubbles: true })
      )
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

    expect(host).toBeDefined();
    expect(open).toHaveBeenCalledWith(
      '',
      UWT_INSPECTOR_WINDOW_NAME,
      expect.stringMatching(/^popup,width=\d+,height=\d+$/)
    );
    expect(doc.title).toBe('Event Inspector · shop');
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
    const { popup, fire, key } = fakePopup();
    jest.spyOn(window, 'open').mockReturnValue(popup);
    const host = uwtOpenInspectorWindow(options);

    key();
    expect(options.onKeydown).toHaveBeenCalledTimes(1);

    fire('pagehide');
    expect(options.onGeometry).toHaveBeenCalledWith({
      width: 900,
      height: 700,
      left: 5,
      top: 6
    });
    expect(options.onClosed).toHaveBeenCalledTimes(1);

    host?.destroy();
    expect(options.onGeometry).toHaveBeenCalledTimes(1);
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
