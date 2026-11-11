/*
 * Public API Surface of ui-watchtower/rum
 *
 * The AWS CloudWatch RUM destination, in its own entry point so the main one
 * never refers to `aws-rum-web`: an optional peer, needed only here, and
 * loaded only once the sink starts.
 */

export { UwtRumTelemetrySink } from './lib/uwt-rum-telemetry.sink/uwt-rum-telemetry.sink';
export type {
  UwtRumDocument,
  UwtRumTelemetrySinkOptions
} from './lib/uwt-rum-telemetry.sink/uwt-rum-telemetry.sink';
export type {
  UwtRumAppMonitorConfig,
  UwtRumBootstrap,
  UwtRumCredentials,
  UwtRumCredentialsProvider
} from './lib/uwt-rum-credentials/uwt-rum-credentials';
