import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, isDevMode, NgZone, PLATFORM_ID } from '@angular/core';
import type { UwtReporter } from '@absaoss-cps/ui-watchtower';

/*
 * Small copies of the main entry point's own Angular helpers. Not imported
 * from it: ng-packagr fixes every entry point's `rootDir` to its own `src`,
 * so this one can't reach the main entry's internals by relative path, and
 * the main entry keeps them out of its public API so they can change freely.
 */

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
 * The page the RUM sink reads: the document in a browser, nothing in a
 * server-side render, where the client never starts. Must be called from an
 * injection context.
 */
export function uwtBrowserDocument(): Document | null {
  const document = inject(DOCUMENT);
  return uwtIsBrowser() ? document : null;
}

/**
 * Runs a callback outside Angular's zone when there is one. Must be called
 * from an injection context.
 */
export function uwtRunOutsideZone(): <T>(callback: () => T) => T {
  const zone = inject(NgZone, { optional: true });
  return (callback) => (zone ? zone.runOutsideAngular(callback) : callback());
}

/**
 * How this package reports what telemetry handles silently: to the console,
 * prefixed. Failures and dropped data only in development mode; something
 * that cannot work as configured (`'config'`) in production too.
 */
export const uwtDevModeReporter: UwtReporter = (level, message, ...details) => {
  if (level === 'config') {
    console.warn(`[ngx-ui-watchtower] ${message}`, ...details);
  } else if (uwtIsDevMode()) {
    console[level](`[ngx-ui-watchtower] ${message}`, ...details);
  }
};
