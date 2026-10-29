import {
  uwtMarkSessionStart,
  uwtSessionElapsed
} from './uwt-session-start.util';

const KEY = 'ngx-ui-watchtower.sessionStarts';

describe('uwt-session-start.util', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => jest.restoreAllMocks());

  it('should measure from the moment a session was marked', () => {
    uwtMarkSessionStart('s1', 1_000);

    expect(uwtSessionElapsed('s1', 4_500)).toBe(3_500);
  });

  it('should keep the first start when the same session is marked again', () => {
    uwtMarkSessionStart('s1', 1_000);
    uwtMarkSessionStart('s1', 9_000);

    expect(uwtSessionElapsed('s1', 10_000)).toBe(9_000);
  });

  it('should report nothing for an unknown or missing session', () => {
    uwtMarkSessionStart('s1', 1_000);

    expect(uwtSessionElapsed('s2', 2_000)).toBeUndefined();
    expect(uwtSessionElapsed(undefined, 2_000)).toBeUndefined();
  });

  it('should report nothing, not a negative time, once the clock is set back past the start', () => {
    uwtMarkSessionStart('s1', 5_000);

    expect(uwtSessionElapsed('s1', 4_999)).toBeUndefined();
    expect(uwtSessionElapsed('s1', 5_000)).toBe(0);
  });

  it('should keep the five most recent sessions', () => {
    for (let i = 1; i <= 6; i++) {
      uwtMarkSessionStart(`s${i}`, i * 1_000);
    }

    expect(uwtSessionElapsed('s1', 10_000)).toBeUndefined();
    expect(uwtSessionElapsed('s2', 10_000)).toBe(8_000);
    expect(uwtSessionElapsed('s6', 10_000)).toBe(4_000);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toHaveLength(5);
  });

  it('should ignore a start that is not a finite number', () => {
    uwtMarkSessionStart('s1', Number.NaN);

    expect(uwtSessionElapsed('s1', 1_000)).toBeUndefined();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('should ignore a stored value that is not its own', () => {
    localStorage.setItem(KEY, 'not json');
    uwtMarkSessionStart('s1', 1_000);

    expect(uwtSessionElapsed('s1', 2_000)).toBe(1_000);

    localStorage.setItem(KEY, JSON.stringify([['s2', 'oops'], 42, ['s3', 7]]));
    expect(uwtSessionElapsed('s2', 10)).toBeUndefined();
    expect(uwtSessionElapsed('s3', 10)).toBe(3);
  });

  it('should keep nothing, and not throw, when storage is blocked', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => uwtMarkSessionStart('s1', 1_000)).not.toThrow();
    expect(uwtSessionElapsed('s1', 3_000)).toBeUndefined();
  });
});
