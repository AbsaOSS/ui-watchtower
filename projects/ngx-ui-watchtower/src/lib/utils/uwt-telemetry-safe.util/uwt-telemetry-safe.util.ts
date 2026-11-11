import { isPlatformBrowser } from '@angular/common';
import { inject, isDevMode, PLATFORM_ID } from '@angular/core';
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
