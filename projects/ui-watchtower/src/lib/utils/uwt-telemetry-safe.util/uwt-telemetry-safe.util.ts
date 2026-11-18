/**
 * What a report is about:
 *
 * - `'error'`: an operation threw, and was skipped;
 * - `'warn'`: data was dropped or altered, or telemetry degraded;
 * - `'config'`: something cannot work as configured, and stays off — worth
 *   showing in production too.
 *
 * @group Types
 */
export type UwtReportLevel = 'error' | 'warn' | 'config';

/**
 * Where telemetry reports what it otherwise handles silently. Telemetry never
 * throws into the application, so this is the only place such problems show.
 *
 * Called with console-style arguments: an unprefixed message, then any
 * details, such as the error. Nothing but `'config'` problems is reported
 * without one, so pass it where problems should be seen, typically in
 * development:
 *
 * ```typescript
 * const report: UwtReporter = (level, message, ...details) =>
 *   console[level === 'error' ? 'error' : 'warn'](`[my-app] ${message}`, ...details);
 * ```
 *
 * A reporter that throws is ignored.
 *
 * @group Types
 */
export type UwtReporter = (
  level: UwtReportLevel,
  message: string,
  ...details: unknown[]
) => void;

/**
 * Prints to the console, prefixed: where a `'config'` problem goes when no
 * reporter is given, as something that cannot work is never silent.
 */
export const uwtConsoleReporter: UwtReporter = (level, message, ...details) =>
  console[level === 'error' ? 'error' : 'warn'](
    `[ui-watchtower] ${message}`,
    ...details
  );

/**
 * Passes a report to `report`, if there is one. A reporter that throws, or
 * a patched console it writes to, never reaches the caller.
 */
export function uwtReport(
  report: UwtReporter | undefined,
  level: UwtReportLevel,
  message: string,
  ...details: unknown[]
): void {
  if (!report) {
    return;
  }
  try {
    report(level, message, ...details);
  } catch {
    // A throwing reporter must never escape telemetry suppression.
  }
}

/**
 * Runs a telemetry operation without letting it affect the application.
 *
 * Every public entry point routes through this wrapper — it never rethrows.
 * The caught error goes to `report`, if given.
 */
export function uwtSafe<T>(
  operation: string,
  fn: () => T,
  fallback: T,
  report?: UwtReporter
): T {
  try {
    return fn();
  } catch (error) {
    uwtReport(report, 'error', `${operation} failed`, error);
    return fallback;
  }
}

/**
 * Void-returning form of {@link uwtSafe}, for the common case of an emit call
 * whose result nobody reads.
 */
export function uwtSafeVoid(
  operation: string,
  fn: () => void,
  report?: UwtReporter
): void {
  uwtSafe(operation, fn, undefined, report);
}

/**
 * Like {@link uwtSafeVoid}, but also catches a rejection from a `void`-typed
 * extension point whose real implementation turns out to be `async` — an
 * application-supplied provider hook, for instance. TypeScript accepts an
 * `async` function wherever `() => void` is expected and discards the
 * promise, so a plain `try`/`catch` can't see it reject. This checks for a
 * thenable result and attaches a rejection handler.
 *
 * Not the default for every call: most `uwtSafeVoid` calls wrap this
 * library's own synchronous code, where the extra check is pure overhead.
 * Use this only for a function whose shape this library merely declares.
 */
export function uwtSafeVoidMaybeAsync(
  operation: string,
  fn: () => void,
  report?: UwtReporter
): void {
  uwtSafe(
    operation,
    () => {
      const result: unknown = fn();
      if (
        result !== null &&
        typeof result === 'object' &&
        typeof (result as { then?: unknown }).then === 'function'
      ) {
        Promise.resolve(result as PromiseLike<unknown>).catch((error) =>
          uwtReport(report, 'error', `${operation} failed`, error)
        );
      }
    },
    undefined,
    report
  );
}

/**
 * Deep-clones a plain-data value. Prefers `structuredClone`; falls back to
 * a JSON round-trip where it's unavailable (e.g. under jsdom) or throws.
 */
export function uwtDeepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through to the JSON fallback
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Fills a byte array from the best available source. `crypto.getRandomValues`
 * works on plain http:// too, where `crypto.randomUUID` doesn't. `Math.random`
 * is the last-resort fallback for an environment with no Web Crypto at all.
 */
function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  const cryptoRef = globalThis.crypto;

  if (typeof cryptoRef?.getRandomValues === 'function') {
    return cryptoRef.getRandomValues(bytes);
  }

  for (let i = 0; i < count; i++) {
    bytes[i] = (Math.random() * 256) | 0;
  }
  return bytes;
}

/** Lowercase hex encoding, two characters per byte. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a correlation identifier. Prefers `crypto.randomUUID`, falling
 * back to formatting random bytes as a v4 UUID.
 *
 * @group Utils
 */
export function uwtUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

/**
 * Monotonic-ish millisecond clock for duration measurement.
 * `performance.now()` is preferred since it's immune to wall-clock
 * adjustments.
 */
export function uwtNow(): number {
  const perf = globalThis.performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
}

/**
 * Milliseconds since the *host* page loaded — prefers `top.performance.now()`
 * over the local realm's own, the same reasoning `uwt-user-timings-internal.util.ts`
 * applies to marks/measures: in a composed page, a fragment runs in its own
 * same-origin iframe with a later `timeOrigin`, so a timeline position taken
 * from its own `performance` doesn't line up against the shell's. Reading
 * `top` always succeeds, even cross-origin; only touching a property on it
 * can throw, in which case this falls back to {@link uwtNow}.
 */
export function uwtElapsedNow(): number {
  try {
    const top = globalThis.top;
    if (typeof top?.performance?.now === 'function') {
      return top.performance.now();
    }
  } catch {
    // cross-origin, or sandboxed without `allow-same-origin`
  }
  return uwtNow();
}

/**
 * Converts an epoch timestamp into the `performance.now()` timeline.
 * Clamped to the current page's lifetime — a future timestamp, or one from
 * before the page loaded, yields `undefined`.
 */
export function uwtEpochToPerf(epochMs: number): number | undefined {
  if (!Number.isFinite(epochMs)) {
    return undefined;
  }

  const perf = globalThis.performance;
  if (typeof perf?.now !== 'function' || typeof perf.timeOrigin !== 'number') {
    return undefined;
  }

  const converted = epochMs - perf.timeOrigin;
  const now = perf.now();

  if (converted < 0 || converted > now) {
    return undefined;
  }

  return converted;
}
