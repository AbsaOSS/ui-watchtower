/*
 * Public API Surface of ui-watchtower
 *
 * The framework-independent engine. Nothing here imports a framework, and
 * nothing touches a browser global when imported.
 */

// Configuration
export { UWT_DEFAULT_TELEMETRY_CONFIG } from './lib/config/uwt-telemetry-common.config/uwt-telemetry-common.config';
export type { UwtTelemetryIdentity } from './lib/config/uwt-telemetry-common.config/uwt-telemetry-common.config';
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

// Contracts a destination or a log backend implements
export { UwtTelemetrySink } from './lib/sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
export type {
  UwtLogApiProvider,
  UwtLogQuery
} from './lib/providers/uwt-log-api.provider/uwt-log-api.provider';

// Utilities an application or a destination needs
export { uwtClassifyTelemetryEvent } from './lib/utils/uwt-telemetry-event.util/uwt-telemetry-event.util';
export type { UwtTelemetrySinkEvent } from './lib/utils/uwt-telemetry-event.util/uwt-telemetry-event.util';
export { uwtIsDebugEnabled } from './lib/utils/uwt-debug-flag.util/uwt-debug-flag.util';
export type { UwtDebugFlag } from './lib/utils/uwt-debug-flag.util/uwt-debug-flag.util';
export { uwtUuid } from './lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
export type { UwtReporter } from './lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
export { uwtMarkSessionStart } from './lib/utils/uwt-session-start.util/uwt-session-start.util';
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

// Used by @absaoss-cps/ngx-ui-watchtower while the engine moves into this
// package; removed from the public API once that code lives here too.
export { uwtSessionElapsed } from './lib/utils/uwt-session-start.util/uwt-session-start.util';
export {
  uwtDeepClone,
  uwtNow,
  uwtSafe,
  uwtSafeVoid,
  uwtSafeVoidMaybeAsync
} from './lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
export { uwtDebugWrite } from './lib/utils/uwt-debug-flag.util/uwt-debug-flag.util';
