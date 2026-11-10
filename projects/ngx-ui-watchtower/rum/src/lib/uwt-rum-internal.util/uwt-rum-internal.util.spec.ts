import { DOCUMENT } from '@angular/common';
import {
  Injector,
  isDevMode,
  NgZone,
  PLATFORM_ID,
  Provider,
  runInInjectionContext
} from '@angular/core';
// The main entry's own copy. The library build can't import it from here:
// ng-packagr compiles each entry point on its own. A spec can, and the two
// copies must behave the same, so this runs both side by side.
import * as main from '../../../../src/lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import * as rum from './uwt-rum-internal.util';

jest.mock('@angular/core', () => ({
  ...jest.requireActual('@angular/core'),
  isDevMode: jest.fn(() => true)
}));

const isDevModeMock = isDevMode as jest.Mock;

/** What the /rum entry copies from the main entry: every one is checked below. */
const SHARED = [
  'uwtBrowserDocument',
  'uwtDevModeReporter',
  'uwtIsBrowser',
  'uwtIsDevMode',
  'uwtRunOutsideZone'
];

const copies = [
  ['main entry', main],
  ['/rum entry', rum]
] as const;

/** Runs `fn` where `providers` are all there is to inject. */
function inContext<T>(providers: Provider[], fn: () => T): T {
  return runInInjectionContext(Injector.create({ providers }), fn);
}

describe("the /rum entry's copies of the main entry's Angular helpers", () => {
  beforeEach(() => {
    isDevModeMock.mockReset();
    isDevModeMock.mockReturnValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should copy exactly the helpers checked here, each also in the main entry', () => {
    expect(Object.keys(rum).sort()).toEqual(SHARED);
    SHARED.forEach((name) => expect(main).toHaveProperty(name));
  });

  describe.each(copies)('the %s copy', (_name, copy) => {
    describe('uwtIsDevMode', () => {
      it.each([[true], [false]])('should report dev mode %s', (devMode) => {
        isDevModeMock.mockReturnValue(devMode);

        expect(copy.uwtIsDevMode()).toBe(devMode);
      });

      it('should report false when isDevMode throws, as outside an Angular context', () => {
        isDevModeMock.mockImplementation(() => {
          throw new Error('no Angular context');
        });

        expect(copy.uwtIsDevMode()).toBe(false);
      });
    });

    describe('the platform', () => {
      const page = {} as Document;

      it.each([
        ['browser', true],
        ['server', false]
      ])(
        'on the %s: browser check %s, and the page only in a browser',
        (platform, browser) => {
          const providers = [
            { provide: PLATFORM_ID, useValue: platform },
            { provide: DOCUMENT, useValue: page }
          ];

          expect(inContext(providers, () => copy.uwtIsBrowser())).toBe(browser);
          expect(inContext(providers, () => copy.uwtBrowserDocument())).toBe(
            browser ? page : null
          );
        }
      );
    });

    describe('uwtRunOutsideZone', () => {
      const zoneWith = (runOutsideAngular: jest.Mock) =>
        [{ provide: NgZone, useValue: { runOutsideAngular } }] as Provider[];

      it("should run a callback through the zone's runOutsideAngular, once, and hand back its result", () => {
        const runOutsideAngular = jest.fn((callback: () => unknown) =>
          callback()
        );
        const run = inContext(zoneWith(runOutsideAngular), () =>
          copy.uwtRunOutsideZone()
        );
        const callback = jest.fn(() => 42);

        expect(run(callback)).toBe(42);
        expect(runOutsideAngular).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
      });

      it('should run a callback that returns nothing once, not a second time', () => {
        const run = inContext(
          zoneWith(jest.fn((callback: () => unknown) => callback())),
          () => copy.uwtRunOutsideZone()
        );
        const callback = jest.fn();

        run(callback);

        expect(callback).toHaveBeenCalledTimes(1);
      });

      it('should call the callback directly when there is no zone', () => {
        const run = inContext([], () => copy.uwtRunOutsideZone());
        const callback = jest.fn(() => 7);

        expect(run(callback)).toBe(7);
        expect(callback).toHaveBeenCalledTimes(1);
      });
    });

    describe('uwtDevModeReporter', () => {
      it.each([
        ['error', true, 'error'],
        ['warn', true, 'warn'],
        ['config', true, 'warn'],
        ['error', false, undefined],
        ['warn', false, undefined],
        ['config', false, 'warn']
      ] as const)(
        'should send a %s report, in dev mode %s, to console.%s',
        (level, devMode, method) => {
          isDevModeMock.mockReturnValue(devMode);
          const error = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);
          const warn = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);

          copy.uwtDevModeReporter(level, 'it failed', { detail: 1 });

          const line = ['[ngx-ui-watchtower] it failed', { detail: 1 }];
          expect({ error: error.mock.calls, warn: warn.mock.calls }).toEqual({
            error: method === 'error' ? [line] : [],
            warn: method === 'warn' ? [line] : []
          });
        }
      );
    });
  });
});
