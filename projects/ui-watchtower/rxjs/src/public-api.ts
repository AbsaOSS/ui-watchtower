/*
 * Public API Surface of ui-watchtower/rxjs
 *
 * RxJS integration, in its own entry point so the main one never loads
 * RxJS: `rxjs` is an optional peer, needed only here.
 */

export { traceScenario } from './lib/uwt-scenario-operators/uwt-scenario-operators';
export type { UwtTraceScenarioOptions } from './lib/uwt-scenario-operators/uwt-scenario-operators';
