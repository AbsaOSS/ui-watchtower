import { inject, Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  UwtScenario,
  UwtScenarioName,
  UwtScenarioOptions,
  UwtScenarioRecord,
  UwtScenarioTelemetry,
  UwtTelemetrySink
} from '@absaoss-cps/ui-watchtower';
import {
  UWT_REDACT_CONFIG,
  uwtTelemetryEnabled,
  UWT_TELEMETRY_IDENTITY
} from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UWT_SCENARIO_TELEMETRY_CONFIG } from '../../config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';
import {
  uwtBrowserDocument,
  uwtDevModeReporter,
  uwtRunOutsideZone
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';

/**
 * Creates and tracks scenarios — user journeys whose health this telemetry
 * layer measures.
 *
 * Each {@link start} call returns an independent {@link UwtScenario}; there is
 * no "current" scenario, so overlapping journeys are tracked separately.
 * Scenarios still in flight when the page unloads are settled as `abandoned`.
 *
 * @example
 * ```typescript
 * const scenario = scenarioTelemetry.start({ name: 'load-dashboard' });
 * try {
 *   scenario.step('fetch-widgets');
 *   const widgets = await this.api.widgets();
 *   scenario.complete({ metadata: { widgetCount: widgets.length } });
 * } catch (error) {
 *   scenario.fail({ error });
 * }
 * ```
 *
 * @group Services
 */
@Injectable({ providedIn: 'root' })
export class UwtScenarioTelemetryService implements OnDestroy {
  /** The core's scenario telemetry, configured from this injector. */
  private readonly scenarios = new UwtScenarioTelemetry({
    identity: inject(UWT_TELEMETRY_IDENTITY),
    config: inject(UWT_SCENARIO_TELEMETRY_CONFIG),
    redact: inject(UWT_REDACT_CONFIG),
    sink: inject(UwtTelemetrySink),
    document: uwtBrowserDocument(),
    enabled: uwtTelemetryEnabled(),
    runOutside: uwtRunOutsideZone(),
    report: uwtDevModeReporter
  });

  private readonly _settled$ = new Subject<UwtScenarioRecord>();

  /**
   * Emits every scenario record as it settles.
   *
   * Useful for reacting to outcomes without wrapping every call site — a
   * debug overlay, a retry prompt, a test harness asserting on journeys.
   *
   * @example
   * ```typescript
   * scenarioTelemetry.settled$
   *   .pipe(filter((r) => r.status === 'failure'))
   *   .subscribe((r) => this.notifications.warn(`${r.scenarioName} failed`));
   * ```
   */
  readonly settled$: Observable<UwtScenarioRecord> =
    this._settled$.asObservable();

  constructor() {
    this.scenarios.onSettled((record) => this._settled$.next(record));
  }

  /**
   * Starts a new scenario.
   *
   * @param options the scenario name and optional classification, timeout and
   *   attributes
   * @returns an independent scenario instance
   */
  start(options: UwtScenarioOptions): UwtScenario {
    return this.scenarios.start(options);
  }

  /**
   * Looks up a scenario that has not yet settled.
   *
   * @param scenarioId the id to look up
   * @returns the scenario, or `undefined` if unknown or already settled
   */
  find(scenarioId: string): UwtScenario | undefined {
    return this.scenarios.find(scenarioId);
  }

  /**
   * Every active scenario with the given name.
   *
   * `name` is a metric dimension, not a concurrency key - any number of
   * scenarios can legitimately share one (two tabs, two dashboard panels,
   * two independently-edited rows). Use this to inspect what's currently
   * running under a name and decide for yourself, e.g. before starting
   * another one.
   *
   * @param name the scenario name to match
   * @returns matching active scenarios, in start order
   */
  findByName(name: UwtScenarioName): UwtScenario[] {
    return this.scenarios.findByName(name);
  }

  /**
   * Looks up an active scenario by id, asserting it has the expected name.
   *
   * The same lookup as {@link find}, with an extra check that its `name`
   * matches - a defensive assertion for a caller that already expects a
   * specific scenario name at this id, rather than a bare id lookup.
   *
   * @param name the expected scenario name
   * @param scenarioId the id to look up
   * @returns the scenario, or `undefined` if not active or its name
   *   doesn't match
   */
  findByNameAndId(
    name: UwtScenarioName,
    scenarioId: string
  ): UwtScenario | undefined {
    return this.scenarios.findByNameAndId(name, scenarioId);
  }

  /**
   * Every scenario currently in flight.
   *
   * @returns the active scenarios, in start order
   */
  getActive(): UwtScenario[] {
    return this.scenarios.getActive();
  }

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.scenarios.dispose();
    this._settled$.complete();
  }
}
