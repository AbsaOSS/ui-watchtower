import { LAB_VALUE_TRANSFORMS } from './lab-options';

type Option = { label: string; value: string };

/**
 * A setting the Settings page offers as a control, in a `?config=` section.
 * `multi` picks several of its options; `lines` is a list of strings, one
 * to a line; `levels` and `shortcuts` have editors of their own.
 */
export type LabField = {
  section: string;
  key: string;
  label: string;
} & (
  | { kind: 'switch' | 'number' | 'text' | 'lines' | 'levels' | 'shortcuts' }
  | { kind: 'select' | 'multi'; options: Option[] }
);

export interface LabFieldGroup {
  title: string;
  fields: LabField[];
}

export const LAB_LOG_LEVELS = [
  { label: 'log — everything', value: 'log' },
  { label: 'warn — warnings and errors', value: 'warn' },
  { label: 'error — errors only', value: 'error' }
];

/**
 * The library's settings the lab takes in its `?config=` overlay, one control
 * each, by area. A label ends with the setting's name, as the overlay has
 * it, so the control and the JSON can be read together.
 */
export const LAB_FIELD_GROUPS: LabFieldGroup[] = [
  {
    title: 'Identity',
    fields: [
      {
        kind: 'text',
        section: 'identity',
        key: 'eventNamespace',
        label: 'Event namespace (identity.eventNamespace)'
      }
    ]
  },
  {
    title: 'Scenarios',
    fields: [
      {
        kind: 'number',
        section: 'scenarios',
        key: 'defaultTimeoutMs',
        label: 'Default timeout, ms (scenarios.defaultTimeoutMs)'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'emitLifecycleEvents',
        label: 'Lifecycle step events (scenarios.emitLifecycleEvents)'
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'maxSteps',
        label: 'Step limit (scenarios.maxSteps)'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'userTimings',
        label: 'User timings (scenarios.userTimings)'
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'markCleanupFallbackMs',
        label: 'Mark cleanup fallback, ms (scenarios.markCleanupFallbackMs)'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'redact',
        label: 'Redact scenario payloads (scenarios.redact)'
      }
    ]
  },
  {
    title: 'Logging',
    fields: [
      {
        kind: 'select',
        section: 'logging',
        key: 'minLevel',
        label: 'Minimum level (logging.minLevel)',
        options: LAB_LOG_LEVELS
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'mirrorErrorsToRum',
        label: 'Mirror errors to RUM (logging.mirrorErrorsToRum)'
      },
      {
        kind: 'levels',
        section: 'logging',
        key: 'levels',
        label: 'Logger levels (logging.levels)'
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'redact',
        label: 'Redact log values (logging.redact)'
      }
    ]
  },
  {
    title: 'BI events',
    fields: [
      {
        kind: 'number',
        section: 'bi',
        key: 'dedupWindowMs',
        label: 'BI dedup window, ms (bi.dedupWindowMs)'
      },
      {
        kind: 'number',
        section: 'bi',
        key: 'dedupMaxKeys',
        label: 'BI dedup keys kept (bi.dedupMaxKeys)'
      },
      {
        kind: 'switch',
        section: 'bi',
        key: 'redact',
        label: 'Redact BI payloads (bi.redact)'
      }
    ]
  },
  {
    title: 'Redaction',
    fields: [
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxStringLength',
        label: 'Longest string (redaction.maxStringLength)'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxKeys',
        label: 'Most keys (redaction.maxKeys)'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxStackLength',
        label: 'Longest stack (redaction.maxStackLength)'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'includeStack',
        label: 'Include stacks (redaction.includeStack)'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'stripUrlQuery',
        label: 'Strip URL queries (redaction.stripUrlQuery)'
      },
      {
        kind: 'multi',
        section: 'redaction',
        key: 'scanValuePatterns',
        label: 'Value patterns scanned (redaction.scanValuePatterns)',
        options: ['email', 'creditCard', 'ssn', 'ipv4', 'phone'].map(
          (name) => ({
            label: name,
            value: name
          })
        )
      },
      {
        kind: 'multi',
        section: 'redaction',
        key: 'extraValueTransforms',
        label: 'Value transforms (redaction.extraValueTransforms)',
        options: Object.keys(LAB_VALUE_TRANSFORMS).map((name) => ({
          label: name,
          value: name
        }))
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraKeyPatterns',
        label:
          'Extra key patterns, one RegExp per line (redaction.extraKeyPatterns)'
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraValuePatterns',
        label:
          'Extra value patterns, one RegExp per line (redaction.extraValuePatterns)'
      }
    ]
  },
  {
    title: 'Event Inspector',
    fields: [
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxEventsPerSection',
        label: 'Events kept per kind (inspector.maxEventsPerSection)'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxPayloadCharsInView',
        label: 'Payload characters shown (inspector.maxPayloadCharsInView)'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'captureBeforeOpen',
        label: 'Keep events from before opening (inspector.captureBeforeOpen)'
      },
      {
        kind: 'shortcuts',
        section: 'inspector',
        key: 'shortcuts',
        label: 'Shortcuts (inspector.shortcuts)'
      }
    ]
  }
];
