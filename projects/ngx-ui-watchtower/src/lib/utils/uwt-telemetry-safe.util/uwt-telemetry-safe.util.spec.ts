import { isDevMode } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {} from '@absaoss-cps/ui-watchtower';
import {
  uwtRunOutsideZone,
  uwtSafe,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync
} from './uwt-telemetry-safe.util';

jest.mock('@angular/core', () => ({
  ...jest.requireActual('@angular/core'),
  isDevMode: jest.fn(() => true)
}));

const isDevModeMock = isDevMode as jest.Mock;

describe('uwtSafe', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    isDevModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return the result when the operation succeeds', () => {
    expect(uwtSafe('op', () => 42, 0)).toBe(42);
  });

  it('should return the fallback instead of throwing', () => {
    const result = uwtSafe(
      'op',
      () => {
        throw new Error('boom');
      },
      'fallback'
    );
    expect(result).toBe('fallback');
  });

  it('should never let a telemetry failure reach the caller', () => {
    expect(() =>
      uwtSafeVoid('op', () => {
        throw new Error('boom');
      })
    ).not.toThrow();
  });

  it('should report the suppressed error in development mode', () => {
    isDevModeMock.mockReturnValue(true);
    uwtSafeVoid('scenario.step', () => {
      throw new Error('boom');
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[ngx-ui-watchtower] scenario.step failed',
      expect.any(Error)
    );
  });

  it('should stay silent in production mode', () => {
    isDevModeMock.mockReturnValue(false);
    uwtSafeVoid('scenario.step', () => {
      throw new Error('boom');
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('should not rethrow even when the dev-mode report itself throws', () => {
    isDevModeMock.mockImplementation(() => {
      throw new Error('outside injection context');
    });
    expect(() =>
      uwtSafeVoid('op', () => {
        throw new Error('boom');
      })
    ).not.toThrow();
  });

  it('should not rethrow when console.error itself throws', () => {
    consoleError.mockImplementation(() => {
      throw new Error('console is patched and broken');
    });
    expect(() =>
      uwtSafeVoid('op', () => {
        throw new Error('boom');
      })
    ).not.toThrow();
  });
});

describe('uwtSafeVoidMaybeAsync', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    isDevModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should behave exactly like uwtSafeVoid for a synchronous function', () => {
    expect(() =>
      uwtSafeVoidMaybeAsync('op', () => {
        throw new Error('boom');
      })
    ).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      '[ngx-ui-watchtower] op failed',
      expect.any(Error)
    );
  });

  it('should not throw for a function that returns void', () => {
    expect(() => uwtSafeVoidMaybeAsync('op', () => undefined)).not.toThrow();
  });

  it('should report a rejection from an async function typed as void', async () => {
    const asyncFn = (async () => {
      throw new Error('async boom');
    }) as () => void;

    uwtSafeVoidMaybeAsync('logApi.deliver', asyncFn);

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      '[ngx-ui-watchtower] logApi.deliver failed',
      expect.any(Error)
    );
  });

  it('should not produce an unhandled rejection for a rejecting async function', async () => {
    const asyncFn = (async () => {
      throw new Error('unhandled if unguarded');
    }) as () => void;

    expect(() => uwtSafeVoidMaybeAsync('op', asyncFn)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('should stay silent in production mode for an async rejection', async () => {
    isDevModeMock.mockReturnValue(false);
    const asyncFn = (async () => {
      throw new Error('async boom');
    }) as () => void;

    uwtSafeVoidMaybeAsync('op', asyncFn);
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('should not produce a new unhandled rejection when console.error itself throws', async () => {
    const nodeProcess = (
      globalThis as unknown as {
        process: {
          on(
            event: 'unhandledRejection',
            listener: (reason: unknown) => void
          ): void;
          off(
            event: 'unhandledRejection',
            listener: (reason: unknown) => void
          ): void;
        };
      }
    ).process;

    const unhandled = jest.fn();
    nodeProcess.on('unhandledRejection', unhandled);
    consoleError.mockImplementation(() => {
      throw new Error('console is patched and broken');
    });
    const asyncFn = (async () => {
      throw new Error('async boom');
    }) as () => void;

    uwtSafeVoidMaybeAsync('op', asyncFn);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    nodeProcess.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('uwtRunOutsideZone', () => {
  it('should run a callback that returns nothing once, and hand back what it returns', () => {
    const run = TestBed.runInInjectionContext(() => uwtRunOutsideZone());
    const nothing = jest.fn();

    run(nothing);

    expect(nothing).toHaveBeenCalledTimes(1);
    expect(run(() => 42)).toBe(42);
  });
});
