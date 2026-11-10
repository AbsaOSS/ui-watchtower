import { UwtTelemetryIdentity } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UwtScenarioTelemetryConfig } from '../../config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';
import {
  UwtScenarioName,
  UwtScenarioOptions,
  UwtScenarioRecord
} from '../../models/uwt-scenario.models/uwt-scenario.models';
import { UwtScenario } from '../../scenario/uwt-scenario/uwt-scenario';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import {
  UwtRedactConfig,
  uwtRedactConfigFor
} from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import {
  uwtDeepClone,
  uwtReport,
  UwtReporter,
  uwtSafe,
  uwtSafeVoid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import {
  uwtListenToPage,
  UwtTelemetryDocument,
  uwtTelemetryDocument
} from '../uwt-telemetry-page/uwt-telemetry-page';

/**
 * How many scenarios may be in flight before a warning suggests a leak.
 *
 * Concurrent scenarios are legitimate — several journeys, tabs or panels
 * can run at once — so this is a smell threshold, not a limit: nothing is
 * dropped or rejected when it is crossed. Set well above any plausible
 * real concurrency, so crossing it might mean scenarios with `timeoutMs: 0` or
 * long lifecycles are being started and never settled.
 */
const ACTIVE_SCENARIO_WARN_THRESHOLD = 50;

/**
 * What {@link UwtScenarioTelemetry} needs.
 *
 * @group Interfaces
 */
export interface UwtScenarioTelemetryOptions {
  /** The application's identity, shared by every concern. */
  identity: UwtTelemetryIdentity;
  /** Scenario settings, complete; see {@link uwtResolveTelemetryConfig}. */
  config: UwtScenarioTelemetryConfig;
  /**
   * Redaction settings shared by every concern. `config.redact: false`
   * turns their configurable part off for scenarios.
   */
  redact: UwtRedactConfig;
  /** Where settled scenarios and their steps go. */
  sink: UwtTelemetrySink;
  /** `false` makes every scenario inert. Default `true`. */
  enabled?: boolean;
  /**
   * The page whose lifecycle settles and flushes scenarios: in-flight ones
   * are settled as abandoned on `pagehide`, and the sink is flushed when the
   * page is hidden. Defaults to the global `document` where there is one;
   * `null` listens to nothing.
   */
  document?: UwtTelemetryDocument | null;
  /**
   * Runs timer scheduling outside the host framework's change detection,
   * when it has one: Angular passes `NgZone.runOutsideAngular`.
   */
  runOutside?: <T>(callback: () => T) => T;
  /** Receives what is handled silently; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * Creates and tracks scenarios — user journeys whose health telemetry
 * measures.
 *
 * Each {@link start} call returns an independent {@link UwtScenario}; there is
 * no "current" scenario, so overlapping journeys are tracked separately.
 * Scenarios still in flight when the page unloads are settled as
 * `abandoned`, and so are those still running when this is disposed.
 *
 * @example
 * ```typescript
 * const scenario = telemetry.scenarios.start({ name: 'load-dashboard' });
 * try {
 *   scenario.step('fetch-widgets');
 *   const widgets = await api.widgets();
 *   scenario.complete({ metadata: { widgetCount: widgets.length } });
 * } catch (error) {
 *   scenario.fail({ error });
 * }
 * ```
 *
 * @group Classes
 */
export class UwtScenarioTelemetry {
  private readonly identity: UwtTelemetryIdentity;
  private readonly config: UwtScenarioTelemetryConfig;
  private readonly redact: UwtRedactConfig;
  private readonly sink: UwtTelemetrySink;
  private readonly enabled: boolean;
  private readonly runOutside?: <T>(callback: () => T) => T;
  private readonly report?: UwtReporter;

  private readonly active = new Map<string, UwtScenario>();
  private readonly listeners = new Set<(record: UwtScenarioRecord) => void>();
  private readonly stopListening: () => void;
  private disposed = false;

  constructor(options: UwtScenarioTelemetryOptions) {
    this.identity = options.identity;
    this.config = options.config;
    this.redact = uwtRedactConfigFor(options.redact, options.config.redact);
    this.sink = options.sink;
    this.enabled = options.enabled !== false;
    this.runOutside = options.runOutside;
    this.report = options.report;
    // Page listeners: only while telemetry is on.
    this.stopListening = this.enabled
      ? uwtListenToPage(
          uwtTelemetryDocument(options.document),
          () => this.flushActive(),
          () => this.flushSink()
        )
      : () => undefined;
  }

  /**
   * Starts a new scenario.
   *
   * @param options the scenario name and optional classification, timeout and
   *   attributes
   * @returns an independent scenario instance; an inert one while telemetry
   *   is off
   */
  start(options: UwtScenarioOptions): UwtScenario {
    if (!this.enabled) {
      // Same return type, nothing recorded, timed, registered or sent.
      return new UwtScenario(options, {
        identity: this.identity,
        scenarioTelemetryConfig: this.config,
        redact: this.redact,
        sink: this.sink,
        onSettled: () => undefined,
        inert: true
      });
    }
    // Nothing here depends on whether this was disposed: something may still
    // start a scenario while an application shuts down, and the destination is
    // the caller's. Such a scenario is a normal one, with its own timeout.
    const scenario = new UwtScenario(options, {
      identity: this.identity,
      scenarioTelemetryConfig: this.config,
      redact: this.redact,
      sink: this.sink,
      runOutside: this.runOutside,
      report: this.report,
      onSettled: (scenarioId, record) => {
        this.active.delete(scenarioId);
        this.notify(record);
      }
    });

    uwtSafeVoid(
      'scenarioTelemetry.register',
      () => {
        this.active.set(scenario.id, scenario);
        if (this.active.size > ACTIVE_SCENARIO_WARN_THRESHOLD) {
          uwtReport(
            this.report,
            'warn',
            `High number of active scenarios (${this.active.size}). Ensure scenarios with timeoutMs: 0 or long lifecycles are settled on destroy.`
          );
        }
      },
      this.report
    );

    return scenario;
  }

  /**
   * Looks up a scenario that has not yet settled.
   *
   * @param scenarioId the id to look up
   * @returns the scenario, or `undefined` if unknown or already settled
   */
  find(scenarioId: string): UwtScenario | undefined {
    return this.active.get(scenarioId);
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
    return this.getActive().filter((scenario) => scenario.name === name);
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
    const scenario = this.find(scenarioId);
    return scenario?.name === name ? scenario : undefined;
  }

  /**
   * Every scenario currently in flight.
   *
   * @returns the active scenarios, in start order
   */
  getActive(): UwtScenario[] {
    return [...this.active.values()];
  }

  /**
   * Calls `listener` with every scenario record as it settles.
   *
   * Useful for reacting to outcomes without wrapping every call site — a
   * debug overlay, a retry prompt, a test harness asserting on journeys.
   * Listeners share one copy of each record, so none of them can change
   * what the sink receives; a throwing listener affects no other.
   *
   * @param listener called once per settled scenario
   * @returns stops calling `listener`
   */
  onSettled(listener: (record: UwtScenarioRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Stops watching the page, settles every scenario still in flight as
   * abandoned and flushes the sink, then forgets the listeners. Nothing else
   * changes: a scenario started later is a normal one, with its own timeout.
   * Calling it again does nothing.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopListening();
    if (this.enabled) {
      this.flushActive();
    }
    this.listeners.clear();
  }

  private notify(record: UwtScenarioRecord): void {
    if (!this.listeners.size) {
      return;
    }
    // Copied so a listener can't mutate the same object that's about to be
    // (or already was) shipped to the sink.
    const copy = uwtSafe(
      'scenarioTelemetry.notify',
      () => uwtDeepClone(record),
      undefined,
      this.report
    );
    if (!copy) {
      return;
    }
    for (const listener of [...this.listeners]) {
      uwtSafeVoid(
        'scenarioTelemetry.notify',
        () => listener(copy),
        this.report
      );
    }
  }

  /**
   * Dispatches what the sink holds, leaving running scenarios alone.
   *
   * Uses the beacon transport since the page may not survive a normal request.
   */
  private flushSink(): void {
    uwtSafeVoid(
      'scenarioTelemetry.flushSink',
      () => this.sink.flush(true),
      this.report
    );
  }

  /**
   * Settles every in-flight scenario as abandoned and asks the sink to send
   * what it holds using a transport that survives unload.
   *
   * Scenario emission is synchronous, so everything settled here reaches the
   * sink before the beacon goes out.
   */
  private flushActive(): void {
    uwtSafeVoid(
      'scenarioTelemetry.flush',
      () => {
        for (const scenario of this.getActive()) {
          scenario.settle('abandoned', {
            reason: 'page-hidden',
            metadata: { abandonedBy: 'page-hidden' }
          });
        }
        this.sink.flush(true);
      },
      this.report
    );
  }
}
