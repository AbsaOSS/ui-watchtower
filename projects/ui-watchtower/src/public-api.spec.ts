import * as core from './public-api';

/**
 * The core must import, and run, where there is no browser: in Node, on a
 * server, in a worker. This spec runs in Jest's Node environment, with no
 * `window`, `document` or `localStorage`.
 */
describe('the core outside a browser', () => {
  it('should import without browser globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
    expect(Object.keys(core)).toContain('uwtMarkSessionStart');
  });

  it('should keep no session start, and not throw, without storage', () => {
    expect(() => core.uwtMarkSessionStart('s1', 1_000)).not.toThrow();
    expect(core.uwtSessionElapsed('s1', 2_000)).toBeUndefined();
  });
});
