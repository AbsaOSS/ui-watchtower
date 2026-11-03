import { defer } from 'rxjs';
import type { MonoTypeOperatorFunction, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { UwtScenarioOutcome } from '../../models/uwt-scenario.models/uwt-scenario.models';
import type { UwtScenario } from '../uwt-scenario/uwt-scenario';
import { uwtSafe } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Options for configuring scenario completion within an RxJS stream.
 *
 * @group Interfaces
 */
export interface UwtTraceScenarioOptions<T> {
  /**
   * Optional mapper that returns an outcome (metadata, statusCode, message)
   * based on the emitted value when the Observable completes successfully.
   */
  outcome?: (value: T) => UwtScenarioOutcome | void;

  /**
   * Outcome used when the stream is unsubscribed before completing or
   * erroring — e.g. a `switchMap` moving on to a newer value.
   */
  cancelOutcome?: UwtScenarioOutcome | (() => UwtScenarioOutcome | void);

  /**
   * What a downstream unsubscribe means once a value has been delivered.
   * Default `'complete'`, so `firstValueFrom`, `take(1)` and `first()` settle
   * as success. Use `'cancel'` for multi-value streams (polling, progress),
   * where stopping after a value is abandonment.
   */
  valueThenTeardown?: 'complete' | 'cancel';
}

/**
 * An RxJS pipeable operator that automatically settles a {@link UwtScenario}
 * based on the stream's outcome: `complete()` on completion, `fail({ error })`
 * on error.
 *
 * @example
 * ```typescript
 * this.http.get<Customer[]>('/api/customers')
 *   .pipe(
 *     traceScenario(scenario, {
 *       outcome: (customers) => ({ metadata: { count: customers.length } })
 *     })
 *   )
 *   .subscribe();
 * ```
 *
 * @param scenario the scenario instance to track
 * @param options optional outcome mapper or configuration
 *
 * @group Utils
 */
export function traceScenario<T>(
  scenario: UwtScenario,
  options?:
    UwtTraceScenarioOptions<T> | ((value: T) => UwtScenarioOutcome | void)
): MonoTypeOperatorFunction<T> {
  const outcomeMapper =
    typeof options === 'function' ? options : options?.outcome;
  const cancelOutcome =
    typeof options === 'function' ? undefined : options?.cancelOutcome;
  const valueThenTeardown =
    (typeof options === 'function' ? undefined : options?.valueThenTeardown) ??
    'complete';

  return (source: Observable<T>): Observable<T> =>
    defer(() => {
      let lastValue: T | undefined;
      let hasValue = false;

      const complete = () => {
        const outcome =
          hasValue && outcomeMapper
            ? uwtSafe(
                'scenario.traceOutcome',
                () => outcomeMapper(lastValue as T),
                undefined
              )
            : undefined;
        scenario.complete(outcome || undefined);
      };

      const unsubscribe = () => {
        if (scenario.isSettled) {
          return;
        }
        // The consumer got a value and stopped listening, as
        // firstValueFrom, take(1) and first() do: treat it as completion.
        if (hasValue && valueThenTeardown === 'complete') {
          complete();
          return;
        }
        const resolved =
          typeof cancelOutcome === 'function'
            ? uwtSafe('scenario.traceCancelOutcome', cancelOutcome, undefined)
            : cancelOutcome;
        scenario.cancel(resolved || undefined);
      };

      return source.pipe(
        tap({
          next: (value) => {
            lastValue = value;
            hasValue = true;
          },
          complete,
          error: (error: unknown) => {
            scenario.fail({ error });
          },
          unsubscribe
        })
      );
    });
}
