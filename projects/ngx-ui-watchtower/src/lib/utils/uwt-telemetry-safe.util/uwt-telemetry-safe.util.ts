import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, isDevMode, NgZone, PLATFORM_ID } from '@angular/core';
import {
  UwtReporter,
  uwtSafe as coreSafe,
  uwtSafeVoidMaybeAsync as coreSafeVoidMaybeAsync
} from '@absaoss-cps/ui-watchtower';

/** `isDevMode()` throws outside an Angular context, so this guards that once for every caller. */
export function uwtIsDevMode(): boolean {
  try {
    return isDevMode();
  } catch {
    return false;
  }
}

/**
 * Whether this code is running in a browser, as opposed to a server-side
 * render. Must be called from an injection context, same as
 * `inject(PLATFORM_ID)` itself requires.
 */
export function uwtIsBrowser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}

/**
 * The page telemetry watches: the document in a browser, nothing in a
 * server-side render. Must be called from an injection context.
 */
export function uwtBrowserDocument(): Document | null {
  const document = inject(DOCUMENT);
  return uwtIsBrowser() ? document : null;
}

/**
 * Runs a callback outside Angular's zone when there is one, so telemetry's
 * long-lived timers never keep the application from becoming stable. Must
 * be called from an injection context.
 */
export function uwtRunOutsideZone(): <T>(callback: () => T) => T {
  const zone = inject(NgZone, { optional: true });
  return (callback) => zone?.runOutsideAngular(callback) ?? callback();
}

/**
 * Runs a callback inside Angular's zone when there is one, so what it
 * resolves is seen by change detection. Must be called from an injection
 * context.
 */
export function uwtRunInsideZone(): <T>(callback: () => T) => T {
  const zone = inject(NgZone, { optional: true });
  return (callback) => (zone ? zone.run(callback) : callback());
}

/**
 * How this package reports what telemetry handles silently: to the console,
 * prefixed, and only in development mode. Everything the core does on this
 * package's behalf is handed it.
 */
export const uwtDevModeReporter: UwtReporter = (level, message, ...details) => {
  if (uwtIsDevMode()) {
    console[level](`[ngx-ui-watchtower] ${message}`, ...details);
  }
};

/**
 * {@link uwtDevModeReporter}, except that warnings are printed in production
 * too: the broadcast host's warnings about a realm that cannot host always
 * were.
 */
export const uwtHostReporter: UwtReporter = (level, message, ...details) => {
  if (level === 'warn') {
    console.warn(`[ngx-ui-watchtower] ${message}`, ...details);
  } else {
    uwtDevModeReporter(level, message, ...details);
  }
};

/**
 * Runs a telemetry operation without letting it affect the application:
 * the core's fail-open wrapper, reporting through {@link uwtDevModeReporter}.
 */
export function uwtSafe<T>(operation: string, fn: () => T, fallback: T): T {
  return coreSafe(operation, fn, fallback, uwtDevModeReporter);
}

/**
 * Void-returning form of {@link uwtSafe}, for the common case of an emit call
 * whose result nobody reads.
 */
export function uwtSafeVoid(operation: string, fn: () => void): void {
  coreSafe(operation, fn, undefined, uwtDevModeReporter);
}

/**
 * Like {@link uwtSafeVoid}, but also catches a rejection from a `void`-typed
 * extension point whose real implementation turns out to be `async`.
 */
export function uwtSafeVoidMaybeAsync(operation: string, fn: () => void): void {
  coreSafeVoidMaybeAsync(operation, fn, uwtDevModeReporter);
}
