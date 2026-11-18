/**
 * Module augmentation as a core consumer writes it: the four registries
 * augmented on `@absaoss-cps/ui-watchtower`, with no framework involved.
 * Registered names must reach every API that takes or returns a name, and
 * anything else must be rejected.
 *
 * Compiled by `npm run typecheck` on its own, never run. An unused
 * `@ts-expect-error` fails the compilation, so a name that stops being
 * rejected is caught too.
 */
import {
  UwtTelemetry,
  UwtBIEvent,
  UwtBIEventName,
  UwtLogConfig,
  UwtLoggerName,
  UwtLogQuery,
  UwtLogRecord,
  UwtScenario,
  UwtScenarioAggregate,
  UwtScenarioName,
  UwtScenarioOptions,
  UwtScenarioRecord,
  UwtScenarioStep,
  UwtScenarioStepEvent,
  UwtStepName,
  UwtTelemetrySinkEvent
} from '@absaoss-cps/ui-watchtower';

declare module '@absaoss-cps/ui-watchtower' {
  interface UwtScenarioNames {
    checkout: true;
    'load-dashboard': true;
  }
  interface UwtScenarioSteps {
    pay: true;
    confirm: true;
  }
  interface UwtBIEventNames {
    export_clicked: true;
  }
  interface UwtLoggerNames {
    checkout: true;
  }
}

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

function expectType<T extends true>(): T | void {
  // Checked at compile time only.
}

// The names are exactly the registered ones.
expectType<Equals<UwtScenarioName, 'checkout' | 'load-dashboard'>>();
expectType<Equals<UwtStepName, 'pay' | 'confirm'>>();
expectType<Equals<UwtBIEventName, 'export_clicked'>>();
expectType<Equals<UwtLoggerName, 'checkout'>>();

// And they reach every model that carries a name.
expectType<Equals<UwtScenarioOptions['name'], UwtScenarioName>>();
expectType<Equals<UwtScenarioRecord['scenarioName'], UwtScenarioName>>();
expectType<
  Equals<UwtScenarioRecord['previousStep'], UwtStepName | undefined>
>();
expectType<
  Equals<
    UwtScenarioStep['name'],
    UwtStepName | 'scenario-start' | 'scenario-end'
  >
>();
expectType<Equals<UwtScenarioStepEvent['scenarioName'], UwtScenarioName>>();
expectType<Equals<UwtScenarioAggregate['name'], UwtStepName>>();
expectType<Equals<UwtScenario['name'], UwtScenarioName>>();
expectType<Equals<UwtBIEvent['eventName'], UwtBIEventName>>();
expectType<Equals<UwtLogRecord['logger'], UwtLoggerName | undefined>>();
expectType<Equals<UwtLogQuery['logger'], UwtLoggerName | undefined>>();
expectType<
  Equals<
    UwtLogConfig['levels'],
    Partial<Record<UwtLoggerName, UwtLogConfig['minLevel']>> | undefined
  >
>();
expectType<
  Equals<
    Extract<
      UwtTelemetrySinkEvent,
      { kind: 'scenario' }
    >['payload']['scenarioName'],
    UwtScenarioName
  >
>();

/** Registered steps accepted. */
export function accepted(scenario: UwtScenario): void {
  scenario.step('pay').step('confirm').endStep();
  scenario.aggregateStart('pay').aggregateEnd('pay');
}

/** Everything else rejected. */
export function rejected(scenario: UwtScenario): void {
  // @ts-expect-error not a registered step
  scenario.step('pai');
  // @ts-expect-error not a registered step
  scenario.aggregateStart('pai');
  // @ts-expect-error not a registered step
  scenario.aggregateEnd('pai');
}

// @ts-expect-error not a registered scenario
export const options: UwtScenarioOptions = { name: 'chekout' };
// @ts-expect-error not a registered logger
export const query: UwtLogQuery = { logger: 'chekout' };
// @ts-expect-error not a registered logger
export const levels: UwtLogConfig['levels'] = { chekout: 'log' };

/** Through the engine: registered names accepted, everything else rejected. */
export async function engine(telemetry: UwtTelemetry): Promise<void> {
  const scenario = telemetry.scenarios.start({ name: 'checkout' });
  telemetry.scenarios.findByName('load-dashboard');
  telemetry.scenarios.findByNameAndId('checkout', scenario.id);
  telemetry.scenarios.onSettled((_record) => {
    expectType<Equals<typeof _record.scenarioName, UwtScenarioName>>();
  });
  telemetry.bi.track('export_clicked');
  telemetry.logging.getLogger('checkout').warn('careful');
  await telemetry.logging.query({ logger: 'checkout' });

  // @ts-expect-error not a registered scenario
  telemetry.scenarios.start({ name: 'chekout' });
  // @ts-expect-error not a registered scenario
  telemetry.scenarios.findByName('chekout');
  // @ts-expect-error not a registered business event
  telemetry.bi.track('export_clikced');
  // @ts-expect-error not a registered logger
  telemetry.logging.getLogger('chekout');
  // @ts-expect-error not a registered logger
  await telemetry.logging.query({ logger: 'chekout' });
}
