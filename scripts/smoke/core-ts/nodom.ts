/**
 * A project without the DOM typings — a Node service, a worker — compiles
 * against the core's main entry point: its declarations need none.
 */
import {
  uwtCreateTelemetry,
  UwtNoopLogApiProvider,
  UwtNoopTelemetrySink,
  UwtTelemetry
} from '@absaoss-cps/ui-watchtower';

export const telemetry: UwtTelemetry = uwtCreateTelemetry({
  identity: { application: 'worker', environment: 'test', version: '1.0.0' },
  destination: new UwtNoopTelemetrySink(),
  logApi: new UwtNoopLogApiProvider(),
  document: null
});
