import { DOCUMENT } from '@angular/common';
import {
  HttpContext,
  HttpContextToken,
  HttpInterceptorFn,
  HttpRequest
} from '@angular/common/http';
import { inject } from '@angular/core';
import { uwtTelemetryEnabled } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import type { UwtScenario } from '../uwt-scenario/uwt-scenario';
import {
  uwtIsBrowser,
  uwtSafe
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Default request header that carries a scenario's id to the backend.
 *
 * @group Utils
 */
export const UWT_DEFAULT_SCENARIO_HEADER = 'X-Uwt-Scenario-Id';

/** The id of the scenario a request belongs to, if any. */
const UWT_SCENARIO_ID = new HttpContextToken<string | undefined>(
  () => undefined
);

/**
 * Options for {@link uwtScenarioHeaderInterceptor}.
 *
 * @group Interfaces
 */
export interface UwtScenarioHeaderOptions {
  /** Request header name. Default {@link UWT_DEFAULT_SCENARIO_HEADER}. */
  headerName?: string;
}

/**
 * Marks an `HttpClient` request as part of a scenario, so
 * {@link uwtScenarioHeaderInterceptor} sends the scenario's id with it.
 *
 * Requests are marked one by one: with several scenarios running at once,
 * nothing else can tell which one a request belongs to.
 *
 * Always a new context, so it never leaks into one shared between requests;
 * add other tokens to the result with `.set()`.
 *
 * @example
 * ```typescript
 * this.http
 *   .get<Customer[]>('/api/customers', { context: uwtScenarioContext(scenario) })
 *   .pipe(traceScenario(scenario))
 *   .subscribe();
 * ```
 *
 * @param scenario the scenario the request belongs to
 * @returns a new context, to pass as the request's `context` option
 *
 * @group Utils
 */
export function uwtScenarioContext(scenario: UwtScenario): HttpContext {
  return new HttpContext().set(UWT_SCENARIO_ID, scenario.id);
}

/**
 * An `HttpClient` interceptor that sends the id of the request's scenario
 * (see {@link uwtScenarioContext}) as a request header, so the backend can
 * log it and tie its work to the journey.
 *
 * Adds the header only to same-origin requests marked with a scenario,
 * while telemetry is on, in a browser, and when the request doesn't already
 * carry it. It never changes how a request succeeds or fails: settling the
 * scenario stays with the caller.
 *
 * It judges "same-origin" by the URL as it sees it, so list it after any
 * interceptor that rewrites URLs, such as one that prefixes an API host.
 *
 * @example
 * ```typescript
 * provideHttpClient(withInterceptors([uwtScenarioHeaderInterceptor()]));
 * ```
 *
 * @param options optional header name
 * @returns the interceptor, for `withInterceptors`
 *
 * @group Utils
 */
export function uwtScenarioHeaderInterceptor(
  options: UwtScenarioHeaderOptions = {}
): HttpInterceptorFn {
  const headerName = options.headerName || UWT_DEFAULT_SCENARIO_HEADER;
  return (req, next) =>
    next(
      uwtSafe(
        'scenarioHeader.intercept',
        () => withHeader(req, headerName),
        req
      )
    );
}

function withHeader(
  req: HttpRequest<unknown>,
  headerName: string
): HttpRequest<unknown> {
  const scenarioId = req.context.get(UWT_SCENARIO_ID);
  if (
    !scenarioId ||
    req.headers.has(headerName) ||
    !uwtTelemetryEnabled() ||
    !uwtIsBrowser()
  ) {
    return req;
  }
  // Same-origin only: a custom header on a cross-origin request needs a CORS
  // preflight the other server may not allow. The realm's own origin, not
  // its URL's: an about:blank or srcdoc frame inherits its creator's.
  const document = inject(DOCUMENT);
  const origin = document.defaultView?.origin ?? document.location.origin;
  if (originOf(req.url, document.baseURI) !== origin) {
    return req;
  }
  return req.clone({ setHeaders: { [headerName]: scenarioId } });
}

/** The URL's origin; `undefined` when it can't be parsed. */
function originOf(url: string, base: string): string | undefined {
  try {
    return new URL(url, base).origin;
  } catch {
    return undefined;
  }
}
