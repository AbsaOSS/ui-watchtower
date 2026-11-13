import type { MonoTypeOperatorFunction } from 'rxjs';
import type {
  UwtScenario,
  UwtScenarioOutcome
} from '@absaoss-cps/ui-watchtower';
import {
  traceScenario as coreTraceScenario,
  UwtTraceScenarioOptions
} from '@absaoss-cps/ui-watchtower/rxjs';
import { uwtDevModeReporter } from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

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
  return coreTraceScenario(scenario, options, uwtDevModeReporter);
}
