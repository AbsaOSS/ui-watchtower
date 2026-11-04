import { TestBed } from '@angular/core/testing';
import {
  UWT_INSPECTOR_PREFERENCES_KEY,
  UwtInspectorPreferenceStorage
} from './uwt-inspector-preferences';

describe('UwtInspectorPreferenceStorage', () => {
  let storage: UwtInspectorPreferenceStorage;
  const store = (value: unknown) =>
    localStorage.setItem(
      UWT_INSPECTOR_PREFERENCES_KEY,
      typeof value === 'string' ? value : JSON.stringify(value)
    );

  beforeEach(() => {
    storage = TestBed.inject(UwtInspectorPreferenceStorage);
  });

  afterEach(() => {
    localStorage.removeItem(UWT_INSPECTOR_PREFERENCES_KEY);
    jest.restoreAllMocks();
  });

  it('should default to an opaque dialog, with nothing remembered', () => {
    expect(storage.read()).toEqual({
      dock: 'dialog',
      transparency: 0,
      paneSize: {}
    });
  });

  it('should read back what was stored', () => {
    const preferences = {
      dock: 'bottom',
      transparency: 35,
      paneSize: { left: 500, right: 640, bottom: 300 },
      window: { width: 1000, height: 700, left: -1200, top: 40 }
    };
    store(preferences);

    expect(storage.read()).toEqual(preferences);
  });

  it.each([
    ['malformed JSON', '{not json'],
    ['not an object', '"right"'],
    [
      'invalid values',
      {
        dock: 'top',
        transparency: 95,
        paneSize: { left: -5, right: 'wide', bottom: Infinity },
        window: { width: 0, height: 700, left: 0, top: 0 }
      }
    ]
  ])('should fall back to the defaults for %s', (_label, value) => {
    store(value);

    expect(storage.read()).toEqual({
      dock: 'dialog',
      transparency: 0,
      paneSize: {}
    });
  });

  it('should replace only what it is given', () => {
    store({ dock: 'left', transparency: 20, paneSize: { left: 500 } });

    storage.update({ dock: 'window' });

    expect(storage.read()).toEqual({
      dock: 'window',
      transparency: 20,
      paneSize: { left: 500 }
    });
  });

  it('should carry on when storage throws', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => storage.update({ dock: 'right' })).not.toThrow();
    expect(storage.read().dock).toBe('dialog');
  });
});
