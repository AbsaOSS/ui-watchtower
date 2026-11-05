import { InjectionToken } from '@angular/core';
import {
  UwtBITelemetryConfig,
  UwtLogConfig,
  UwtRedactConfig,
  UwtScenarioTelemetryConfig
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorConfig } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';

/** Value transforms a {@link LabConfig} can name. */
export const LAB_VALUE_TRANSFORMS = {
  /** The lab's order ids, `A-1001`, as `A-****`. */
  'mask-order-ids': (value: string) => value.replace(/\bA-\d{4}\b/g, 'A-****')
};

/**
 * Library settings for one run, as JSON can carry them, laid over the lab's
 * own. A pattern is a `RegExp` source, a value transform one of
 * {@link LAB_VALUE_TRANSFORMS}.
 */
export interface LabConfig {
  identity?: { eventNamespace?: string };
  scenarios?: Partial<UwtScenarioTelemetryConfig>;
  logging?: Partial<UwtLogConfig>;
  bi?: Partial<UwtBITelemetryConfig>;
  redaction?: Partial<
    Omit<
      UwtRedactConfig,
      'extraKeyPatterns' | 'extraValuePatterns' | 'extraValueTransforms'
    >
  > & {
    extraKeyPatterns?: string[];
    extraValuePatterns?: string[];
    extraValueTransforms?: (keyof typeof LAB_VALUE_TRANSFORMS)[];
  };
  inspector?: Pick<
    Partial<UwtEventInspectorConfig>,
    'maxEventsPerSection' | 'maxPayloadCharsInView' | 'shortcuts'
  >;
  /** The lab's own: its log provider batches, and sends on `flush()`. */
  lab?: { logBatching?: boolean };
}

/**
 * How the lab was started, read once from the query string — the way an app
 * picks its configuration at startup:
 *
 * - `?destination=rum` (default), `noop`, or `custom`: the lab's own sink
 * - `?telemetry=off` turns telemetry off with `withTelemetryEnabled`
 * - `?channel=shared`: the shell joins the default broadcast channel, shared
 *   with every tab, rather than one of its own
 * - `?inspector=off` disables the Event Inspector; `noshortcut` drops its
 *   keyboard shortcut
 * - `?config=<JSON>` lays a {@link LabConfig} over the lab's settings
 */
export interface LabOptions {
  destination: 'rum' | 'noop' | 'custom';
  telemetry: boolean;
  channel: 'tab' | 'shared';
  inspector: 'on' | 'off' | 'noshortcut';
  config: LabConfig;
}

export const LAB_OPTIONS = new InjectionToken<LabOptions>('LAB_OPTIONS');

export function labOptions(search: string): LabOptions {
  const params = new URLSearchParams(search);
  const inspector = params.get('inspector');
  const destination = params.get('destination');
  return {
    destination:
      destination === 'noop' || destination === 'custom' ? destination : 'rum',
    telemetry: params.get('telemetry') !== 'off',
    channel: params.get('channel') === 'shared' ? 'shared' : 'tab',
    inspector:
      inspector === 'off' || inspector === 'noshortcut' ? inspector : 'on',
    config: parseConfig(params.get('config'))
  };
}

function parseConfig(json: string | null): LabConfig {
  if (!json) {
    return {};
  }
  try {
    const config = JSON.parse(json);
    return config && typeof config === 'object' ? config : {};
  } catch {
    console.warn('[lab] ?config= is not JSON; ignored.');
    return {};
  }
}
