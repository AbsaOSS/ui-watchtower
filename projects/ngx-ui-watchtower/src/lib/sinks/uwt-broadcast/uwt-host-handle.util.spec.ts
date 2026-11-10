import {
  UwtHostHandle,
  uwtFindOnHost,
  uwtHostHandleOf,
  uwtJoinHttpRealm
} from './uwt-host-handle.util';

const KEY = Symbol.for('ngx-ui-watchtower.host');

type FakeWindow = { parent?: FakeWindow; [KEY]?: UwtHostHandle };

function topLevel(handle?: UwtHostHandle): FakeWindow {
  const window: FakeWindow = handle ? { [KEY]: handle } : {};
  window.parent = window;
  return window;
}

function rumHost(leave = jest.fn()) {
  const traceHttp = jest.fn(() => leave);
  return { window: topLevel({ traceHttp }), traceHttp, leave };
}

const asWindow = (window: FakeWindow) => window as unknown as Window;
const join = (realm: FakeWindow) => uwtJoinHttpRealm(asWindow(realm));

describe('uwtHostHandleOf', () => {
  it('creates the handle once and hands back the same one', () => {
    const window = topLevel();

    const handle = uwtHostHandleOf(asWindow(window));
    handle.channelName = 'shell-channel';

    expect(uwtHostHandleOf(asWindow(window))).toBe(handle);
    expect(window[KEY]).toBe(handle);
  });
});

describe('uwtFindOnHost', () => {
  it('finds each field on the nearest ancestor that has it', () => {
    const outer = topLevel({ channelName: 'outer-channel' });
    const inner: FakeWindow = {
      parent: outer,
      [KEY]: { traceHttp: () => () => undefined }
    };
    const fragment: FakeWindow = { parent: inner };

    expect(uwtFindOnHost(asWindow(fragment), 'channelName')).toBe(
      'outer-channel'
    );
    expect(uwtFindOnHost(asWindow(fragment), 'traceHttp')).toBe(
      inner[KEY]?.traceHttp
    );
  });

  it('finds nothing in a top-level window', () => {
    const window = topLevel({ channelName: 'own-channel' });

    expect(uwtFindOnHost(asWindow(window), 'channelName')).toBeUndefined();
  });
});

describe('uwtJoinHttpRealm', () => {
  afterEach(() => jest.restoreAllMocks());

  it('joins the parent window hosting RUM, and leaves it', () => {
    const host = rumHost();
    const fragment: FakeWindow = { parent: host.window };

    const leave = join(fragment);
    expect(host.traceHttp).toHaveBeenCalledWith(fragment);

    leave?.();
    expect(host.leave).toHaveBeenCalledTimes(1);
  });

  it('looks past ancestors that do not host RUM', () => {
    const host = rumHost();
    const outer: FakeWindow = { parent: host.window };
    const nested: FakeWindow = { parent: outer };

    join(nested);

    expect(host.traceHttp).toHaveBeenCalledWith(nested);
  });

  it('does nothing in a top-level window', () => {
    const host = rumHost();

    expect(join(host.window)).toBeUndefined();
    expect(host.traceHttp).not.toHaveBeenCalled();
  });

  it('does nothing when no ancestor hosts RUM', () => {
    const fragment: FakeWindow = { parent: topLevel() };

    expect(join(fragment)).toBeUndefined();
  });

  it('stops where an ancestor cannot be reached', () => {
    const fragment = {
      get parent(): FakeWindow {
        throw new DOMException('Blocked', 'SecurityError');
      }
    };

    expect(join(fragment)).toBeUndefined();
  });

  it('looks past a cross-origin ancestor to the same-origin host above it', () => {
    const host = rumHost();
    // A cross-origin window: `parent` is readable, anything else throws.
    const crossOrigin = new Proxy({} as FakeWindow, {
      get: (_target, key) => {
        if (key === 'parent') {
          return host.window;
        }
        throw new DOMException('Blocked', 'SecurityError');
      }
    });
    const fragment: FakeWindow = { parent: crossOrigin };

    join(fragment);

    expect(host.traceHttp).toHaveBeenCalledWith(fragment);
  });

  it('never lets a failing host break the app', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = rumHost(
      jest.fn(() => {
        throw new Error('leave failed');
      })
    );
    const leave = join({ parent: host.window });
    expect(() => leave?.()).not.toThrow();

    host.traceHttp.mockImplementation(() => {
      throw new Error('join failed');
    });
    expect(() => join({ parent: host.window })?.()).not.toThrow();
  });
});
