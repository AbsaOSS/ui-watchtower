/**
 * Module augmentation exactly as a consumer writes it: the four registries
 * augmented on `@absaoss-cps/ngx-ui-watchtower`. Registered names must reach
 * every API that takes or returns a name, and anything else must be
 * rejected.
 *
 * Compiled by `npm run typecheck` on its own, never run. An unused
 * `@ts-expect-error` fails the compilation, so a name that stops being
 * rejected is caught too.
 */
import { inject } from '@angular/core';
import { ObservedValueOf } from 'rxjs';
import {
  UwtBIEvent,
  UwtBIEventName,
  UwtBITelemetryService,
  UwtLogConfig,
  UwtLoggerName,
  UwtLoggerService,
  UwtLogQuery,
  UwtLogRecord,
  UwtScenario,
  UwtScenarioAggregate,
  UwtScenarioName,
  UwtScenarioOptions,
  UwtScenarioRecord,
  UwtScenarioStep,
  UwtScenarioStepEvent,
  UwtScenarioTelemetryService,
  UwtStepName,
  withLogging
} from '@absaoss-cps/ngx-ui-watchtower';

declare module '@absaoss-cps/ngx-ui-watchtower' {
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

/** Registered names accepted, everything else rejected. */
export class Usage {
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly bi = inject(UwtBITelemetryService);
  private readonly logs = inject(UwtLoggerService);

  accepted(): unknown[] {
    const scenario = this.scenarios.start({ name: 'checkout' });
    scenario.step('pay').step('confirm').endStep();
    scenario.aggregateStart('pay').aggregateEnd('pay');
    this.bi.track('export_clicked', { format: 'csv' });
    this.logs.getLogger('checkout').warn('Slow payment');
    const settled = this.scenarios.settled$;
    expectType<
      Equals<ObservedValueOf<typeof settled>['scenarioName'], UwtScenarioName>
    >();
    return [
      settled,
      this.scenarios.findByName('load-dashboard'),
      this.scenarios.findByNameAndId('checkout', 'id'),
      this.logs.query({ logger: 'checkout' }),
      withLogging({ levels: { checkout: 'log' } })
    ];
  }

  rejected(scenario: UwtScenario): void {
    // @ts-expect-error not a registered scenario
    this.scenarios.start({ name: 'chekout' });
    // @ts-expect-error not a registered scenario
    this.scenarios.findByName('chekout');
    // @ts-expect-error not a registered scenario
    this.scenarios.findByNameAndId('chekout', 'id');
    // @ts-expect-error not a registered step
    scenario.step('pai');
    // @ts-expect-error not a registered step
    scenario.aggregateStart('pai');
    // @ts-expect-error not a registered step
    scenario.aggregateEnd('pai');
    // @ts-expect-error not a registered business event
    this.bi.track('export_clikced');
    // @ts-expect-error not a registered logger
    this.logs.getLogger('chekout');
    // @ts-expect-error not a registered logger
    this.logs.query({ logger: 'chekout' });
    // @ts-expect-error not a registered logger
    withLogging({ levels: { chekout: 'log' } });
  }
}
