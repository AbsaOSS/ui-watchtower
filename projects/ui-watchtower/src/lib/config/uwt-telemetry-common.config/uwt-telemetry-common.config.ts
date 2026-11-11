import {
  UwtBITelemetryConfig,
  UWT_DEFAULT_BI_TELEMETRY_CONFIG
} from '../uwt-bi-telemetry.config/uwt-bi-telemetry.config';
import {
  UwtLogConfig,
  UWT_DEFAULT_LOG_CONFIG
} from '../uwt-log.config/uwt-log.config';
import {
  UwtScenarioTelemetryConfig,
  UWT_DEFAULT_SCENARIO_TELEMETRY_CONFIG
} from '../uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';
import { UWT_DEFAULT_EVENT_NAMESPACE } from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import {
  UWT_DEFAULT_REDACT_CONFIG,
  UwtRedactConfig
} from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';

/**
 * The identity every telemetry record and event carries — application name,
 * deployment environment and version, plus the event-type namespace.
 *
 * @group Interfaces
 */
export interface UwtTelemetryIdentity {
  /** Application name, e.g. `composition`. Becomes a session attribute. */
  application: string;

  /** Deployment environment, e.g. `dev`, `qa`, `prod`. */
  environment: string;

  /** Application version, e.g. `22.0.0`. */
  version: string;

  /**
   * Prefix for the custom event types this library emits — `{namespace}.scenario`,
   * `{namespace}.scenario.step` and `{namespace}.bi`.
   *
   * Defaults to `com.uwt`.
   */
  eventNamespace?: string;
}

/**
 * Library defaults for every concern not carried by {@link UwtTelemetryIdentity}
 * — applied to anything a configuration leaves out.
 *
 * @group Utils
 */
export const UWT_DEFAULT_TELEMETRY_CONFIG: {
  eventNamespace: string;
  scenario: UwtScenarioTelemetryConfig;
  logs: UwtLogConfig;
  bi: UwtBITelemetryConfig;
  redact: UwtRedactConfig;
} = {
  eventNamespace: UWT_DEFAULT_EVENT_NAMESPACE,
  scenario: UWT_DEFAULT_SCENARIO_TELEMETRY_CONFIG,
  logs: UWT_DEFAULT_LOG_CONFIG,
  bi: UWT_DEFAULT_BI_TELEMETRY_CONFIG,
  redact: UWT_DEFAULT_REDACT_CONFIG
};

/**
 * Overrides for each concern's configuration: whatever is left out takes the
 * library default.
 *
 * @group Interfaces
 */
export interface UwtTelemetryConfigOverrides {
  scenarios?: Partial<UwtScenarioTelemetryConfig>;
  logging?: Partial<UwtLogConfig>;
  bi?: Partial<UwtBITelemetryConfig>;
  redaction?: Partial<UwtRedactConfig>;
}

/**
 * Each concern's configuration, complete.
 *
 * @group Interfaces
 */
export interface UwtTelemetryConfig {
  scenarios: UwtScenarioTelemetryConfig;
  logging: UwtLogConfig;
  bi: UwtBITelemetryConfig;
  redaction: UwtRedactConfig;
}

/**
 * Completes each concern's configuration with the library defaults: every
 * override over its default, shallowly. Redaction's pattern and transform
 * lists are copied into fresh arrays, so callers never share array identity
 * with the defaults or each other.
 *
 * The one place defaults are applied, for the engine and every adapter.
 *
 * @param overrides what the application sets
 * @returns the configuration an engine runs with
 *
 * @group Utils
 */
export function uwtResolveTelemetryConfig(
  overrides: UwtTelemetryConfigOverrides = {}
): UwtTelemetryConfig {
  const defaults = UWT_DEFAULT_TELEMETRY_CONFIG;
  const redaction = overrides.redaction ?? {};
  return {
    scenarios: { ...defaults.scenario, ...overrides.scenarios },
    logging: { ...defaults.logs, ...overrides.logging },
    bi: { ...defaults.bi, ...overrides.bi },
    redaction: {
      ...defaults.redact,
      ...redaction,
      extraKeyPatterns: [
        ...(redaction.extraKeyPatterns ?? defaults.redact.extraKeyPatterns)
      ],
      extraValuePatterns: [
        ...(redaction.extraValuePatterns ?? defaults.redact.extraValuePatterns)
      ],
      extraValueTransforms: [
        ...(redaction.extraValueTransforms ??
          defaults.redact.extraValueTransforms)
      ]
    }
  };
}
