/**
 * Nothing augmented: every name falls back to `string`, so an application
 * that never declares a registry can use any name.
 *
 * Compiled by `npm run typecheck` with `compat.ts`, never run. It must not
 * share a compilation with `augmented.ts`, whose augmentation would apply
 * here too.
 */
import {
  UwtBIEventName,
  UwtLoggerName,
  UwtScenarioName,
  UwtStepName
} from '@absaoss-cps/ngx-ui-watchtower';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

function expectType<T extends true>(): T | void {
  // Checked at compile time only.
}

expectType<Equals<UwtScenarioName, string>>();
expectType<Equals<UwtStepName, string>>();
expectType<Equals<UwtBIEventName, string>>();
expectType<Equals<UwtLoggerName, string>>();
