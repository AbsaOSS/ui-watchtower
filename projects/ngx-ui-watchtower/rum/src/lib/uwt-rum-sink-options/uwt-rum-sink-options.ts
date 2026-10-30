import { InjectionToken } from '@angular/core';

/**
 * Options for `provideUwtTelemetryRumSink()`: set in the application's own
 * code, unlike `UwtRumAppMonitorConfig`, which mirrors the SDK and
 * usually arrives from the backend.
 *
 * @group Interfaces
 */
export interface UwtRumSinkOptions {
  /**
   * Same-origin URLs that must not get the X-Ray header, matched against
   * the full resolved URL, e.g. `[/\/files\//]`. Use it for an endpoint that
   * redirects to another origin which doesn't allow the header in CORS: the
   * browser passes the header on with the redirect, and the request fails.
   * Covers fragment realms too. Applies to the default `telemetries` only;
   * with your own, your `addXRayTraceIdHeader` decides. Default `[]`.
   */
  xRayExcludeUrls?: RegExp[];
}

/** Carries {@link UwtRumSinkOptions} to the sink. Internal. */
export const UWT_RUM_SINK_OPTIONS = new InjectionToken<UwtRumSinkOptions>(
  'UWT_RUM_SINK_OPTIONS'
);
