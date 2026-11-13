/*
 * Public API Surface of ngx-ui-watchtower
 *
 * Covers two audiences: an application using telemetry, and an author
 * writing a custom sink or log transport.
 */

// Configuration
export {
  UWT_REDACT_CONFIG,
  UWT_TELEMETRY_ENABLED,
  UWT_TELEMETRY_IDENTITY
} from './lib/config/uwt-telemetry-common.config/uwt-telemetry-common.config';
export { UWT_DEFAULT_TELEMETRY_CONFIG } from '@absaoss-cps/ui-watchtower';
export type {
  UwtBITelemetryConfig,
  UwtLogConfig,
  UwtScenarioTelemetryConfig,
  UwtTelemetryIdentity
} from '@absaoss-cps/ui-watchtower';
export { UWT_BI_TELEMETRY_CONFIG } from './lib/config/uwt-bi-telemetry.config/uwt-bi-telemetry.config';
export { UWT_LOG_CONFIG } from './lib/config/uwt-log.config/uwt-log.config';
export { UWT_SCENARIO_TELEMETRY_CONFIG } from './lib/config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';

// Providers
export {
  UwtTelemetryDestinationOptions,
  UwtTelemetryFeature,
  UwtTelemetryLocalSinkMode,
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  provideUwtTelemetryDestination,
  provideUwtTelemetrySink,
  withBIEvents,
  withLogging,
  withRedaction,
  withScenarios,
  withTelemetryEnabled
} from './lib/providers/uwt-telemetry-common.providers/uwt-telemetry-common.providers';
export { UWT_LOG_API_PROVIDER } from './lib/providers/uwt-log-api.provider/uwt-log-api.provider';
export type {
  UwtLogApiProvider,
  UwtLogQuery
} from '@absaoss-cps/ui-watchtower';
export { UwtNoopLogApiProvider } from './lib/providers/uwt-noop-log-api.provider/uwt-noop-log-api.provider';
export { UwtBroadcastLogApiProvider } from './lib/providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';

// Models, and the name registries an application augments: declared in
// the core and re-exported, so augmenting them on this package's module path
// reaches the same registries the core's own APIs use.
export type {
  UwtBIEvent,
  UwtBIEventDetail,
  UwtBIEventName,
  UwtBIEventNames
} from '@absaoss-cps/ui-watchtower';
export type {
  UwtLogger,
  UwtLoggerName,
  UwtLoggerNames,
  UwtLogDetail,
  UwtLogLevel,
  UwtLogRecord
} from '@absaoss-cps/ui-watchtower';
export { UWT_LOG_LEVEL_ORDER } from '@absaoss-cps/ui-watchtower';
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
} from '@absaoss-cps/ui-watchtower';
export {
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_TELEMETRY_EVENT_TYPE,
  uwtEventTypes
} from '@absaoss-cps/ui-watchtower';
export type {
  UwtTelemetryAttribution,
  UwtTelemetryError,
  UwtTelemetryEventTypes,
  UwtTelemetryMetadata
} from '@absaoss-cps/ui-watchtower';

// Services
export { UwtBITelemetryService } from './lib/services/uwt-bi-telemetry.service/uwt-bi-telemetry.service';
export { UwtLoggerService } from './lib/services/uwt-logger.service/uwt-logger.service';
export { UwtScenario } from '@absaoss-cps/ui-watchtower';
export { UwtScenarioTelemetryService } from './lib/services/uwt-scenario-telemetry.service/uwt-scenario-telemetry.service';

// Sinks
export { UwtTelemetryBroadcastHost } from './lib/sinks/uwt-broadcast/uwt-broadcast-host.service';
export { UwtBroadcastTelemetrySink } from './lib/sinks/uwt-broadcast/uwt-broadcast-telemetry.sink';
export {
  UWT_BROADCAST_CHANNEL,
  UWT_DEFAULT_BROADCAST_CHANNEL
} from './lib/sinks/uwt-broadcast/uwt-broadcast.messages';
export { UwtTelemetrySink } from '@absaoss-cps/ui-watchtower';
export { UwtNoopTelemetrySink } from './lib/sinks/uwt-telemetry/uwt-noop-telemetry.sink/uwt-noop-telemetry.sink';

// Utilities an application or a custom sink needs
export { traceScenario } from './lib/scenario/uwt-scenario-operators/uwt-scenario-operators';
export { uwtClassifyTelemetryEvent } from '@absaoss-cps/ui-watchtower';
export type { UwtTelemetrySinkEvent } from '@absaoss-cps/ui-watchtower';
export type { UwtTraceScenarioOptions } from './lib/scenario/uwt-scenario-operators/uwt-scenario-operators';
export { uwtIsDebugEnabled, uwtUuid } from '@absaoss-cps/ui-watchtower';
export type { UwtDebugFlag } from '@absaoss-cps/ui-watchtower';
export { uwtMarkSessionStart } from '@absaoss-cps/ui-watchtower';
export {
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_REDACTED,
  uwtRedactConfigFor
} from '@absaoss-cps/ui-watchtower';
export type {
  UwtPiiValuePattern,
  UwtRedactConfig
} from '@absaoss-cps/ui-watchtower';
export {
  uwtNormalizeError,
  uwtRedactMetadata,
  uwtScrubString
} from './lib/utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
