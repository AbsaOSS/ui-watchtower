import { provideUwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';

/**
 * Where the telemetry goes: nowhere, and without importing `/rum`. The
 * smoke test checks this build has no `aws-rum-web` in it; the `rum`
 * configuration swaps in `destination.rum.ts`.
 */
export const destination = [provideUwtTelemetrySink('noop')];
