import { isDevMode } from '@angular/core';
import * as core from '@absaoss-cps/ui-watchtower';
import type {} from '@absaoss-cps/ui-watchtower';
import {
  uwtNormalizeError,
  uwtRedactMetadata,
  uwtScrubString
} from './uwt-telemetry-redact.util';

jest.mock('@angular/core', () => ({
  ...jest.requireActual('@angular/core'),
  isDevMode: jest.fn(() => true)
}));

const isDevModeMock = isDevMode as jest.Mock;

/** Redaction itself is tested in the core; this is what this package adds. */
describe('the redaction functions this package exports', () => {
  const throwingTransform = {
    ...core.UWT_DEFAULT_REDACT_CONFIG,
    extraValueTransforms: [
      (): string => {
        throw new Error('broken transform');
      }
    ]
  };
  let consoleWarn: jest.SpyInstance;

  beforeEach(() => {
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    isDevModeMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return what the core returns', () => {
    const config = { ...core.UWT_DEFAULT_REDACT_CONFIG, maxKeys: 2 };
    const metadata = { url: 'https://x.dev/p?token=1', password: 'x', n: 1 };
    const error = new Error('at https://x.dev/?q=1');

    expect(uwtScrubString('https://x.dev/p?q=1', config)).toBe(
      core.uwtScrubString('https://x.dev/p?q=1', config)
    );
    expect(uwtRedactMetadata(metadata, config)).toEqual(
      core.uwtRedactMetadata(metadata, config)
    );
    expect(uwtRedactMetadata(metadata)).toEqual(
      core.uwtRedactMetadata(metadata)
    );
    expect(uwtNormalizeError(error)).toEqual(core.uwtNormalizeError(error));
  });

  it('should warn on the console, prefixed, in development mode', () => {
    uwtScrubString('unchanged', throwingTransform);
    uwtRedactMetadata(
      { a: 1, b: 2, c: 3 },
      {
        ...core.UWT_DEFAULT_REDACT_CONFIG,
        maxKeys: 2
      }
    );
    // An error's message and its stack are each scrubbed.
    uwtNormalizeError(new Error('boom'), throwingTransform);

    expect(consoleWarn.mock.calls).toEqual([
      [
        '[ngx-ui-watchtower] An extraValueTransforms function threw and was skipped',
        expect.any(Error)
      ],
      [
        '[ngx-ui-watchtower] Metadata exceeded maxKeys (2) and was truncated. Attributes past the limit were dropped silently in production.'
      ],
      [
        '[ngx-ui-watchtower] An extraValueTransforms function threw and was skipped',
        expect.any(Error)
      ],
      [
        '[ngx-ui-watchtower] An extraValueTransforms function threw and was skipped',
        expect.any(Error)
      ]
    ]);
  });

  it('should stay silent in production mode', () => {
    isDevModeMock.mockReturnValue(false);

    uwtScrubString('unchanged', throwingTransform);
    uwtRedactMetadata(
      { a: 1, b: 2, c: 3 },
      {
        ...core.UWT_DEFAULT_REDACT_CONFIG,
        maxKeys: 2
      }
    );

    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
