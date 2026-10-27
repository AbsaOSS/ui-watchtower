import type { AwsRum, FetchPlugin, XhrPlugin } from 'aws-rum-web';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-rum-internal.util/uwt-rum-internal.util';

/**
 * Where a shell leaves its handle for the frames nested in it, on its own
 * `window`.
 *
 * Must match the key in the main entry's `uwt-host-handle.util.ts`; not
 * imported from there, for the reason given in `uwt-rum-internal.util.ts`.
 */
export const UWT_HOST_KEY = Symbol.for('ngx-ui-watchtower.host');

/**
 * The shell's handle, as the main entry's `uwt-host-handle.util.ts` defines
 * it. This sink owns only `traceHttp`; the broadcast host owns `channelName`.
 */
export interface UwtHostHandle {
  channelName?: string;
  /** Traces `realm`'s HTTP requests; returns the call that stops it. */
  traceHttp?(realm: Window): () => void;
}

/** The part of the `aws-rum-web` module the host needs. */
export interface UwtRumHttpPlugins {
  FetchPlugin: typeof FetchPlugin;
  XhrPlugin: typeof XhrPlugin;
}

/**
 * Traces the HTTP requests of same-origin fragment realms with the RUM
 * client's own `fetch`/XHR plugins, so a fragment's requests get the same
 * X-Ray header and HTTP events as the host's own.
 */
export interface UwtHttpRealmHost {
  /**
   * Starts tracing realms that joined and realms that join later. A no-op
   * unless `telemetries` enables `http`, matching what the host traces.
   */
  start(
    sdk: UwtRumHttpPlugins,
    awsRum: AwsRum,
    telemetries: readonly unknown[]
  ): void;

  /** Stops tracing every realm and takes `traceHttp` off the handle. */
  stop(): void;
}

type HttpConfig = ConstructorParameters<typeof FetchPlugin>[0];

/**
 * This realm's own listener methods, called on a fragment's window. Web
 * Fragments reroutes listeners added through a fragment's own
 * `addEventListener` to the shell's window (all but `load`, `popstate`,
 * `beforeunload` and `unload`), so a `pagehide` added that way would never
 * fire for the fragment. Not `unload` instead: it takes the page out of the
 * back/forward cache.
 */
const { addEventListener: listen, removeEventListener: unlisten } =
  EventTarget.prototype;

interface JoinedRealm {
  onPageHide: (event: Event) => void;
  release?: () => void;
}

/**
 * Puts `traceHttp` on `host`'s handle and returns its controls.
 *
 * Realms can join before {@link UwtHttpRealmHost.start}: fragments mount
 * while the host is still fetching credentials and loading the SDK.
 */
export function uwtHostHttpRealms(host: Window): UwtHttpRealmHost {
  const realms = new Map<Window, JoinedRealm>();
  let instrument: ((realm: Window) => () => void) | undefined;

  const traced = (realm: Window) =>
    uwtSafe('rum.realms.instrument', () => instrument?.(realm), undefined);

  const leave = (realm: Window) =>
    uwtSafeVoid('rum.realms.leave', () => {
      const joined = realms.get(realm);
      if (!joined) {
        return;
      }
      realms.delete(realm);
      unlisten.call(realm, 'pagehide', joined.onPageHide);
      joined.release?.();
    });

  const traceHttp = (realm: Window) =>
    uwtSafe(
      'rum.realms.join',
      () => {
        if (!realms.has(realm)) {
          // A removed fragment iframe fires pagehide even if its app is
          // never destroyed; release it then, so no detached window is
          // kept. Not when the page only enters the back/forward cache:
          // the realm comes back alive, and nothing would join it again.
          const onPageHide = (event: Event) => {
            if (!(event as PageTransitionEvent).persisted) {
              leave(realm);
            }
          };
          listen.call(realm, 'pagehide', onPageHide);
          const joined: JoinedRealm = { onPageHide };
          realms.set(realm, joined);
          joined.release = traced(realm);
        }
        return () => leave(realm);
      },
      () => undefined
    );
  const slots = host as unknown as Record<symbol, UwtHostHandle | undefined>;
  const handle = (slots[UWT_HOST_KEY] ??= {});
  handle.traceHttp = traceHttp;

  return {
    start(sdk, awsRum, telemetries) {
      const config = httpTelemetryConfig(telemetries);
      if (!config) {
        return;
      }
      let plugins: ReturnType<typeof realmPlugins> | undefined;
      let count = 0;
      instrument = (realm) => {
        plugins ??= realmPlugins(sdk);
        const id = `realm-${++count}`;
        const instances = [
          new plugins.RealmFetchPlugin(realm, config, id),
          new plugins.RealmXhrPlugin(realm, config, id)
        ];
        // addPlugin loads each plugin, which patches the realm's globals.
        instances.forEach((plugin) => awsRum.addPlugin(plugin));
        return () => instances.forEach((plugin) => plugin.release());
      };
      for (const [realm, joined] of realms) {
        joined.release ??= traced(realm);
      }
    },

    stop() {
      instrument = undefined;
      [...realms.keys()].forEach(leave);
      if (handle.traceHttp === traceHttp) {
        delete handle.traceHttp;
      }
    }
  };
}

/**
 * The `http` entry's config, as the client reads it (`'http'` or
 * `['http', config]`, case-insensitive), or `undefined` when there is none.
 */
function httpTelemetryConfig(
  telemetries: readonly unknown[]
): HttpConfig | undefined {
  for (const entry of telemetries) {
    const [name, config] = Array.isArray(entry) ? entry : [entry];
    if (typeof name === 'string' && name.toLowerCase() === 'http') {
      return (config as HttpConfig | undefined) ?? {};
    }
  }
  return undefined;
}

/**
 * The client's `fetch`/XHR plugins, aimed at another realm's globals.
 *
 * Only the patch target and the plugin id change; header generation and
 * recording stay the client's own. Built from the dynamically imported
 * module, since the classes don't exist until the SDK loads. The client
 * can't remove a plugin, so a released one stays registered, emptied: no
 * patches, no realm.
 */
function realmPlugins(sdk: UwtRumHttpPlugins) {
  class RealmFetchPlugin extends sdk.FetchPlugin {
    constructor(
      private realm: Window | undefined,
      config: HttpConfig,
      private readonly realmId: string
    ) {
      super(config);
    }

    override getPluginId(): string {
      return `${super.getPluginId()}.${this.realmId}`;
    }

    protected override get patches() {
      const realm = this.realm;
      return realm
        ? super.patches.map((patch) => ({ ...patch, nodule: realm }))
        : [];
    }

    /** Unpatches and lets go of the realm. */
    release(): void {
      this.disable();
      this.realm = undefined;
    }
  }

  class RealmXhrPlugin extends sdk.XhrPlugin {
    constructor(
      private realm: Window | undefined,
      config: HttpConfig,
      private readonly realmId: string
    ) {
      super(config);
    }

    override getPluginId(): string {
      return `${super.getPluginId()}.${this.realmId}`;
    }

    protected override get patches() {
      const realm = this.realm as (Window & typeof globalThis) | undefined;
      return realm
        ? super.patches.map((patch) => ({
            ...patch,
            nodule: realm.XMLHttpRequest.prototype
          }))
        : [];
    }

    /** Unpatches and lets go of the realm. */
    release(): void {
      this.disable();
      this.realm = undefined;
    }
  }

  return { RealmFetchPlugin, RealmXhrPlugin };
}
