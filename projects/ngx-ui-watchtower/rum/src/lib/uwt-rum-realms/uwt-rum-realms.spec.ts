import { AwsRum, FetchPlugin, XhrPlugin } from 'aws-rum-web';
import {
  UWT_HOST_KEY,
  UwtHostHandle,
  UwtHttpRealmHost,
  uwtHostHttpRealms
} from './uwt-rum-realms';

/** The SDK's plugin context, as the real client would pass it. */
function pluginContext() {
  return {
    config: { enableXRay: true, enableW3CTraceId: false },
    getSession: () => ({ record: true }),
    record: jest.fn()
  };
}

/** A `fetch` init, as far as the plugin touches it. */
type Init = { headers?: Record<string, string> };

class FakeXhr {
  readonly headers: Record<string, string> = {};

  open(..._args: unknown[]): void {}

  send(): void {}

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  addEventListener(): void {}
}

/** A fragment realm: its own `fetch`, its own `XMLHttpRequest`. */
function fragmentRealm() {
  const fetch = jest.fn(() =>
    Promise.resolve({ status: 200, ok: true, headers: new Headers() })
  );
  class Xhr extends FakeXhr {}
  const realm = Object.assign(new EventTarget(), {
    fetch,
    XMLHttpRequest: Xhr
  });
  return {
    window: realm as unknown as Window,
    nativeFetch: fetch,
    nativeOpen: Xhr.prototype.open,
    fetch: (url: string, init: Init) =>
      (realm.fetch as (url: string, init: Init) => Promise<unknown>)(url, init),
    xhr: () => new realm.XMLHttpRequest(),
    hide: (persisted = false) =>
      realm.dispatchEvent(Object.assign(new Event('pagehide'), { persisted })),
    get patchedFetch() {
      return realm.fetch !== fetch;
    }
  };
}

const sdk = { FetchPlugin, XhrPlugin };
const http = ['http', { addXRayTraceIdHeader: [/^\//] }];

describe('uwtHostHttpRealms', () => {
  let host: Window;
  let realms: UwtHttpRealmHost;
  let context: ReturnType<typeof pluginContext>;
  let added: (FetchPlugin | XhrPlugin)[];
  let awsRum: AwsRum;

  const handle = () =>
    (host as unknown as Record<symbol, UwtHostHandle | undefined>)[
      UWT_HOST_KEY
    ];
  const join = (realm: Window) => {
    const traceHttp = handle()?.traceHttp;
    if (!traceHttp) {
      throw new Error('no traceHttp on the handle');
    }
    return traceHttp(realm);
  };

  beforeEach(() => {
    host = {} as Window;
    realms = uwtHostHttpRealms(host);
    context = pluginContext();
    added = [];
    awsRum = {
      addPlugin: (plugin: FetchPlugin | XhrPlugin) => {
        added.push(plugin);
        plugin.load(context as never);
      }
    } as unknown as AwsRum;
  });

  afterEach(() => {
    realms.stop();
    jest.restoreAllMocks();
  });

  it('traces a realm that joined before the client started', async () => {
    const fragment = fragmentRealm();
    join(fragment.window);
    expect(fragment.patchedFetch).toBe(false);

    realms.start(sdk, awsRum, ['errors', http]);
    const init: Init = {};
    await fragment.fetch('/api/customers', init);

    expect(init.headers?.['X-Amzn-Trace-Id']).toMatch(
      /^Root=1-[0-9a-f]{8}-[0-9a-f]{24};Parent=[0-9a-f]{16};Sampled=1$/
    );
    expect(fragment.nativeFetch).toHaveBeenCalledTimes(1);
    expect(context.record).toHaveBeenCalledWith(
      'com.amazon.rum.xray_trace_event',
      expect.anything()
    );
  });

  it('traces a realm that joins after the client started', async () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);

    const init: Init = {};
    await fragment.fetch('/api/customers', init);

    expect(init.headers).toHaveProperty('X-Amzn-Trace-Id');
  });

  it("patches the realm's own XMLHttpRequest", () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);

    const xhr = fragment.xhr();
    xhr.open('GET', '/api/customers');
    xhr.send();

    expect(xhr.headers['X-Amzn-Trace-Id']).toMatch(/^Root=1-/);
  });

  it('gives every realm its own plugin ids', () => {
    realms.start(sdk, awsRum, [http]);
    join(fragmentRealm().window);
    join(fragmentRealm().window);

    const ids = added.map((plugin) => plugin.getPluginId());
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain(new FetchPlugin().getPluginId());
  });

  it('instruments a realm once, however often it joins', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);
    join(fragment.window);

    expect(added).toHaveLength(2);
  });

  it('unpatches the realm and lets go of it on leave', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    const leave = join(fragment.window);

    leave();

    expect(fragment.patchedFetch).toBe(false);
    expect(fragment.xhr().open).toBe(fragment.nativeOpen);
    for (const plugin of added) {
      expect((plugin as unknown as { patches: unknown[] }).patches).toEqual([]);
    }
  });

  it('releases a realm whose page is hidden, e.g. a removed iframe', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);

    fragment.hide();

    expect(fragment.patchedFetch).toBe(false);
  });

  it('keeps a realm traced while the page is only cached (back/forward)', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);

    fragment.hide(true);

    expect(fragment.patchedFetch).toBe(true);
  });

  it('never traces a realm whose join failed', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Not an EventTarget, so the pagehide listener can't be added.
    const notAWindow = { fetch: jest.fn() } as unknown as Window;
    const nativeFetch = (notAWindow as unknown as { fetch: unknown }).fetch;
    join(notAWindow);

    realms.start(sdk, awsRum, [http]);

    expect((notAWindow as unknown as { fetch: unknown }).fetch).toBe(
      nativeFetch
    );
  });

  it('releases a Web Fragments realm, whose own addEventListener is rerouted', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    // As Web Fragments does: listeners added through the fragment's own
    // addEventListener go to the shell's window instead.
    fragment.window.addEventListener = () => undefined;
    join(fragment.window);

    fragment.hide();

    expect(fragment.patchedFetch).toBe(false);
  });

  it('releases every realm and takes traceHttp off the handle on stop', () => {
    realms.start(sdk, awsRum, [http]);
    const fragment = fragmentRealm();
    join(fragment.window);

    realms.stop();

    expect(fragment.patchedFetch).toBe(false);
    expect(handle()?.traceHttp).toBeUndefined();
  });

  it("leaves the broadcast host's channel name on the handle on stop", () => {
    const shared = handle();
    if (shared) {
      shared.channelName = 'shell-channel';
    }

    realms.stop();

    expect(handle()?.channelName).toBe('shell-channel');
  });

  it('traces nothing when the client has no http telemetry', () => {
    realms.start(sdk, awsRum, ['errors', 'performance']);
    const fragment = fragmentRealm();
    join(fragment.window);

    expect(added).toHaveLength(0);
    expect(fragment.patchedFetch).toBe(false);
  });

  it('reads the http entry the way the client does', () => {
    realms.start(sdk, awsRum, ['HTTP']);
    join(fragmentRealm().window);

    expect(added).toHaveLength(2);
  });
});
