import {
  uwtSafe,
  uwtSafeVoid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Where a shell leaves its handle for the frames nested in it, on its own
 * `window`. Must match the key in the rum entry's `uwt-rum-realms.ts`.
 */
const UWT_HOST_KEY = Symbol.for('ngx-ui-watchtower.host');

/**
 * What a shell offers the frames nested in it. Each field is set by the part
 * of the shell that owns it, and looked up by nested fragments on its own.
 */
export interface UwtHostHandle {
  /** The channel the shell's broadcast host listens on. */
  channelName?: string;

  /**
   * Traces `realm`'s `fetch`/XHR with the shell's RUM client; returns the
   * call that stops it. Set by the RUM sink.
   */
  traceHttp?(realm: Window): () => void;
}

/** This window's handle, created on first use. Shell side. */
export function uwtHostHandleOf(window: Window): UwtHostHandle {
  const slots = window as unknown as Record<symbol, UwtHostHandle | undefined>;
  return (slots[UWT_HOST_KEY] ??= {});
}

/**
 * `field` from the nearest ancestor window whose handle has it. Fragment
 * side. Each field is looked up on its own, so a nested shell missing one
 * doesn't hide an outer shell's.
 *
 * @param realm this realm's `window`
 * @param field the handle field to look for
 * @returns the value, or `undefined` when no ancestor offers it
 */
export function uwtFindOnHost<K extends keyof UwtHostHandle>(
  realm: Window,
  field: K
): UwtHostHandle[K] | undefined {
  let current = realm;
  let parent = parentOf(current);
  while (parent && parent !== current) {
    current = parent;
    const value = handleOn(current)?.[field];
    if (value !== undefined) {
      return value;
    }
    parent = parentOf(current);
  }
  return undefined;
}

/**
 * Hands `realm` to the nearest ancestor window running the RUM client, which
 * then traces this realm's `fetch`/XHR requests like its own: same X-Ray
 * header, same HTTP events, same session.
 *
 * @param realm this realm's `window`
 * @returns the call that hands it back, or `undefined` when no ancestor
 *   hosts RUM (yet), so the caller can try again later
 */
export function uwtJoinHttpRealm(realm: Window): (() => void) | undefined {
  const traceHttp = uwtFindOnHost(realm, 'traceHttp');
  if (!traceHttp) {
    return undefined;
  }
  const leave = uwtSafe(
    'httpRealm.join',
    () => traceHttp(realm),
    () => undefined
  );
  return () => uwtSafeVoid('httpRealm.leave', leave);
}

/** A window's parent; `undefined` when it can't be reached. */
function parentOf(window: Window): Window | undefined {
  try {
    return window.parent ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The handle on `window`, if any. A cross-origin window can't be read, but
 * its parent still can, and may be the same-origin shell.
 */
function handleOn(window: Window): UwtHostHandle | undefined {
  try {
    return (window as unknown as Record<symbol, UwtHostHandle | undefined>)[
      UWT_HOST_KEY
    ];
  } catch {
    return undefined;
  }
}
