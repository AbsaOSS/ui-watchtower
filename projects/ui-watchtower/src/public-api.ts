/*
 * Public API Surface of ui-watchtower
 *
 * The framework-independent engine. Nothing here imports a framework, and
 * nothing touches a browser global when imported.
 */

// The engine
export { uwtCreateTelemetry } from './lib/engine/uwt-telemetry/uwt-telemetry';
export type {
  UwtTelemetry,
  UwtTelemetryOptions
} from './lib/engine/uwt-telemetry/uwt-telemetry';
export { UwtScenarioTelemetry } from './lib/engine/uwt-scenario-telemetry/uwt-scenario-telemetry';
export type { UwtScenarioTelemetryOptions } from './lib/engine/uwt-scenario-telemetry/uwt-scenario-telemetry';
export { UwtBITelemetry } from './lib/engine/uwt-bi-telemetry/uwt-bi-telemetry';
export type { UwtBITelemetryOptions } from './lib/engine/uwt-bi-telemetry/uwt-bi-telemetry';
export { UwtLogTelemetry } from './lib/engine/uwt-log-telemetry/uwt-log-telemetry';
export type { UwtLogTelemetryOptions } from './lib/engine/uwt-log-telemetry/uwt-log-telemetry';
export type { UwtTelemetryDocument } from './lib/engine/uwt-telemetry-page/uwt-telemetry-page';

// Configuration
export {
  UWT_DEFAULT_TELEMETRY_CONFIG,
  uwtResolveTelemetryConfig
} from './lib/config/uwt-telemetry-common.config/uwt-telemetry-common.config';
export type {
  UwtTelemetryConfig,
  UwtTelemetryConfigOverrides,
  UwtTelemetryIdentity
} from './lib/config/uwt-telemetry-common.config/uwt-telemetry-common.config';
export type { UwtBITelemetryConfig } from './lib/config/uwt-bi-telemetry.config/uwt-bi-telemetry.config';
export type { UwtLogConfig } from './lib/config/uwt-log.config/uwt-log.config';
export type { UwtScenarioTelemetryConfig } from './lib/config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';

// Models, and the name registries an application augments
export type {
  UwtBIEvent,
  UwtBIEventDetail,
  UwtBIEventName,
  UwtBIEventNames
} from './lib/models/uwt-bi.models/uwt-bi.models';
export type {
  UwtLogger,
  UwtLoggerName,
  UwtLoggerNames,
  UwtLogDetail,
  UwtLogLevel,
  UwtLogRecord
} from './lib/models/uwt-log.models/uwt-log.models';
export { UWT_LOG_LEVEL_ORDER } from './lib/models/uwt-log.models/uwt-log.models';
export type {
  UwtScenarioAggregate,
  UwtScenarioName,
  UwtScenarioNames,
  UwtScenarioOptions,
  UwtScenarioOutcome,
  UwtScenarioRecord,
  UwtScenarioStatus,
  UwtScenarioStep,
  UwtScenarioStepDetail,
  UwtScenarioStepEvent,
  UwtScenarioStepStatus,
  UwtScenarioSteps,
  UwtStepName
} from './lib/models/uwt-scenario.models/uwt-scenario.models';
export {
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_TELEMETRY_EVENT_TYPE,
  uwtEventTypes
} from './lib/models/uwt-telemetry-common.models/uwt-telemetry-common.models';
export type {
  UwtTelemetryAttribution,
  UwtTelemetryError,
  UwtTelemetryEventTypes,
  UwtTelemetryMetadata
} from './lib/models/uwt-telemetry-common.models/uwt-telemetry-common.models';

// Scenarios
export { UwtScenario } from './lib/scenario/uwt-scenario/uwt-scenario';

// Contracts a destination or a log backend implements, and the explicit
// "nowhere" of each
export { UwtTelemetrySink } from './lib/sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
export { UwtNoopTelemetrySink } from './lib/sinks/uwt-telemetry/uwt-noop-telemetry.sink/uwt-noop-telemetry.sink';
export type {
  UwtLogApiProvider,
  UwtLogQuery
} from './lib/providers/uwt-log-api.provider/uwt-log-api.provider';
export { UwtNoopLogApiProvider } from './lib/providers/uwt-noop-log-api.provider/uwt-noop-log-api.provider';

// Shell and fragments: a fragment forwards its telemetry and logs over a
// BroadcastChannel to the shell's host, which records them
export {
  UWT_DEFAULT_BROADCAST_CHANNEL,
  uwtConnectBroadcastChannel
} from './lib/sinks/uwt-broadcast/uwt-broadcast.messages';
export type {
  UwtBroadcastConnection,
  UwtBroadcastConnectOptions,
  UwtBroadcastMessage
} from './lib/sinks/uwt-broadcast/uwt-broadcast.messages';
export { UwtBroadcastTelemetrySink } from './lib/sinks/uwt-broadcast/uwt-broadcast-telemetry.sink';
export type { UwtBroadcastTelemetrySinkOptions } from './lib/sinks/uwt-broadcast/uwt-broadcast-telemetry.sink';
export {
  UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS,
  UwtBroadcastLogApiProvider
} from './lib/providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';
export type { UwtBroadcastLogApiProviderOptions } from './lib/providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';
export { UwtTelemetryBroadcastHost } from './lib/sinks/uwt-broadcast/uwt-broadcast-host';
export type { UwtTelemetryBroadcastHostOptions } from './lib/sinks/uwt-broadcast/uwt-broadcast-host';

// Utilities an application or a destination needs
export { uwtClassifyTelemetryEvent } from './lib/utils/uwt-telemetry-event.util/uwt-telemetry-event.util';
export type { UwtTelemetrySinkEvent } from './lib/utils/uwt-telemetry-event.util/uwt-telemetry-event.util';
export { uwtIsDebugEnabled } from './lib/utils/uwt-debug-flag.util/uwt-debug-flag.util';
export type { UwtDebugFlag } from './lib/utils/uwt-debug-flag.util/uwt-debug-flag.util';
export {
  uwtConsoleReporter,
  uwtReport,
  uwtSafe,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync,
  uwtUuid
} from './lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
export type {
  UwtReporter,
  UwtReportLevel
} from './lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
export {
  uwtMarkSessionStart,
  uwtSessionElapsed
} from './lib/utils/uwt-session-start.util/uwt-session-start.util';
export {
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_REDACTED,
  uwtNormalizeError,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  uwtScrubString
} from './lib/utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
export type {
  UwtPiiValuePattern,
  UwtRedactConfig
} from './lib/utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
