import { InjectionToken } from '@angular/core';
import {
  UwtBITelemetryConfig,
  UwtLogConfig,
  UwtRedactConfig,
  UwtScenarioTelemetryConfig,
  UwtTelemetryIdentity
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorConfig } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { parseJsonObject } from './lab-json';

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
  identity?: Partial<UwtTelemetryIdentity>;
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
    | 'maxEventsPerSection'
    | 'maxPayloadCharsInView'
    | 'shortcuts'
    | 'captureBeforeOpen'
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

/** The query string that starts the lab with `options`. */
export function labSearch(options: LabOptions): string {
  const params = new URLSearchParams();
  if (options.destination !== 'rum') {
    params.set('destination', options.destination);
  }
  if (!options.telemetry) {
    params.set('telemetry', 'off');
  }
  if (options.channel === 'shared') {
    params.set('channel', 'shared');
  }
  if (options.inspector !== 'on') {
    params.set('inspector', options.inspector);
  }
  if (Object.keys(options.config).length > 0) {
    params.set('config', JSON.stringify(options.config));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * The overlay's redaction settings as the library takes them. A pattern
 * that isn't a `RegExp` source, or a transform the lab doesn't know, is left
 * out with a warning, rather than stop the lab from starting.
 */
export function labRedaction(
  redaction: LabConfig['redaction'] = {}
): Partial<UwtRedactConfig> {
  const {
    extraKeyPatterns,
    extraValuePatterns,
    extraValueTransforms,
    ...rest
  } = redaction;
  const transforms = list(extraValueTransforms, 'extraValueTransforms');
  return {
    ...rest,
    ...(extraKeyPatterns && {
      extraKeyPatterns: patterns(extraKeyPatterns, 'extraKeyPatterns', 'i')
    }),
    ...(extraValuePatterns && {
      extraValuePatterns: patterns(extraValuePatterns, 'extraValuePatterns')
    }),
    ...(transforms && {
      extraValueTransforms: transforms.flatMap((name) => {
        const transform =
          LAB_VALUE_TRANSFORMS[name as keyof typeof LAB_VALUE_TRANSFORMS];
        if (!transform) {
          console.warn(`[lab] ?config= has no value transform "${name}".`);
        }
        return transform ? [transform] : [];
      })
    })
  };
}

function patterns(sources: unknown, field: string, flags?: string): RegExp[] {
  return (list(sources, field) ?? []).flatMap((source) => {
    try {
      return [new RegExp(String(source), flags)];
    } catch {
      console.warn(`[lab] ?config= ${field}: "${source}" isn't a RegExp.`);
      return [];
    }
  });
}

function list(value: unknown, field: string): unknown[] | undefined {
  if (value === undefined || Array.isArray(value)) {
    return value;
  }
  console.warn(`[lab] ?config= ${field} isn't a list; left out.`);
  return undefined;
}

function parseConfig(json: string | null): LabConfig {
  if (!json) {
    return {};
  }
  const config = parseJsonObject(json);
  if (!config) {
    console.warn('[lab] ?config= is not a JSON object; ignored.');
  }
  return config ?? {};
}
