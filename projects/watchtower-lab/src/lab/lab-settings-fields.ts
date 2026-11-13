import { LAB_VALUE_TRANSFORMS, LabOptions } from './lab-options';
import { LabBrokerMode } from './lab-wire.service';

type Option = { label: string; value: string };

/**
 * A setting Settings offers as a control. `section` is where it is kept:
 * `start` for how the lab starts, `broker` for the mock broker's app monitor
 * config, and otherwise its section of the `?config=` overlay. `multi` picks
 * several of its options; `lines` is a list of strings, one to a line;
 * `levels` and `shortcuts` have editors of their own.
 */
export type LabField = {
  section: string;
  key: string;
  /** What it is, as people read it; its control adds the setting's name. */
  label: string;
  /** What the app monitor does with none given: broker settings only. */
  default?: unknown;
} & (
  | { kind: 'switch' | 'number' | 'text' | 'lines' | 'levels' | 'shortcuts' }
  | { kind: 'select' | 'multi'; options: Option[] }
);

/**
 * A field's control label: what it is, then the setting's name as the JSON
 * has it, so the control and the JSON can be read together.
 */
export function labFieldLabel(field: LabField): string {
  switch (field.section) {
    case 'start':
      return field.label;
    case 'broker':
      return `${field.label} (${field.key})`;
    default:
      return `${field.label} (${field.section}.${field.key})`;
  }
}

/** The groups of sections in the Settings list, in order. */
export const LAB_SETTINGS_AREAS = [
  'Library',
  'Mock backend',
  'Diagnostics',
  'Advanced'
] as const;

/** How a section's settings take effect, as its tag says. */
export const LAB_SETTINGS_APPLIES = {
  reload: 'Applies on reload',
  server: 'Applies on reload, in every tab',
  now: 'Applies at once, in this browser'
} as const;

/** A section of Settings: a page of its own, with what it sets. */
export interface LabSettingsSection {
  /** Its address, under `/settings`. */
  path: string;
  label: string;
  area: (typeof LAB_SETTINGS_AREAS)[number];
  /** How its settings take effect; none for a readout. */
  applies?: keyof typeof LAB_SETTINGS_APPLIES;
  /** What it sets, under its title. */
  lead: string;
  fields: LabField[];
}

export const LAB_LOG_LEVELS = [
  { label: 'log — everything', value: 'log' },
  { label: 'warn — warnings and errors', value: 'warn' },
  { label: 'error — errors only', value: 'error' }
];

/** How the lab starts; each is read once, at startup, from the address. */
const DESTINATIONS: { label: string; value: LabOptions['destination'] }[] = [
  { label: 'rum — the RUM sink, to the mock backend', value: 'rum' },
  { label: 'noop — nothing is sent', value: 'noop' },
  { label: "custom — the lab's own sink", value: 'custom' }
];
const CHANNELS: { label: string; value: LabOptions['channel'] }[] = [
  { label: "tab — the shell's own channel", value: 'tab' },
  { label: 'shared — one channel for every tab', value: 'shared' }
];
const INSPECTOR_MODES: { label: string; value: LabOptions['inspector'] }[] = [
  { label: 'on — with its keyboard shortcut', value: 'on' },
  { label: 'no shortcut — open it from the page', value: 'noshortcut' },
  { label: 'off — disabled', value: 'off' }
];

export const LAB_BROKER_MODES: { label: string; value: LabBrokerMode }[] = [
  { label: 'ok — RUM records normally', value: 'ok' },
  { label: 'null — RUM off for the page', value: 'null' },
  { label: 'fail — broker error, the app carries on', value: 'fail' },
  {
    label: 'short-expiry — credentials refresh within seconds',
    value: 'short-expiry'
  },
  { label: 'flaky — fails twice, then answers', value: 'flaky' },
  {
    label: 'invalid — a pattern as a string: RUM not started',
    value: 'invalid'
  },
  {
    label: 'null-on-refresh — RUM off at the first refresh',
    value: 'null-on-refresh'
  },
  {
    label: 'no-credentials-on-refresh — a refresh without credentials',
    value: 'no-credentials-on-refresh'
  }
];

/**
 * The sections of Settings, by what their settings change, each with the
 * controls it offers. The library's settings are the ones the lab takes in
 * its `?config=` overlay; the app monitor's are the ones most worth trying,
 * with the values the broker answers with, or the app monitor takes, when
 * none is given. Any others are the JSON's.
 */
export const LAB_SETTINGS_SECTIONS: LabSettingsSection[] = [
  {
    path: 'app-identity',
    label: 'App identity',
    area: 'Library',
    applies: 'reload',
    lead: "What the telemetry says it comes from: the application, its environment and version, and the namespace of the library's event types.",
    fields: [
      {
        kind: 'text',
        section: 'identity',
        key: 'application',
        label: 'Application name'
      },
      {
        kind: 'text',
        section: 'identity',
        key: 'environment',
        label: 'Environment'
      },
      { kind: 'text', section: 'identity', key: 'version', label: 'Version' },
      {
        kind: 'text',
        section: 'identity',
        key: 'eventNamespace',
        label: 'Event namespace'
      }
    ]
  },
  {
    path: 'delivery',
    label: 'Delivery',
    area: 'Library',
    applies: 'reload',
    lead: 'Whether the library sends telemetry, where it goes and over which broadcast channel, and whether the lab batches its logs.',
    fields: [
      {
        kind: 'select',
        section: 'start',
        key: 'destination',
        label: 'Destination',
        options: DESTINATIONS
      },
      {
        kind: 'select',
        section: 'start',
        key: 'channel',
        label: 'Broadcast channel',
        options: CHANNELS
      },
      {
        kind: 'switch',
        section: 'start',
        key: 'telemetry',
        label: 'Telemetry'
      },
      {
        kind: 'switch',
        section: 'lab',
        key: 'logBatching',
        label: 'Batch logs, sent on flush()'
      }
    ]
  },
  {
    path: 'scenarios',
    label: 'Scenarios',
    area: 'Library',
    applies: 'reload',
    lead: 'How scenarios time out, count their steps, and report them.',
    fields: [
      {
        kind: 'number',
        section: 'scenarios',
        key: 'defaultTimeoutMs',
        label: 'Default timeout, ms'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'emitLifecycleEvents',
        label: 'Lifecycle step events'
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'maxSteps',
        label: 'Step limit'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'userTimings',
        label: 'User timings'
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'markCleanupFallbackMs',
        label: 'Mark cleanup fallback, ms'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'redact',
        label: 'Redact scenario payloads'
      }
    ]
  },
  {
    path: 'bi-events',
    label: 'BI events',
    area: 'Library',
    applies: 'reload',
    lead: 'How the library drops repeated BI events, and whether it redacts their payloads.',
    fields: [
      {
        kind: 'number',
        section: 'bi',
        key: 'dedupWindowMs',
        label: 'BI dedup window, ms'
      },
      {
        kind: 'number',
        section: 'bi',
        key: 'dedupMaxKeys',
        label: 'BI dedup keys kept'
      },
      {
        kind: 'switch',
        section: 'bi',
        key: 'redact',
        label: 'Redact BI payloads'
      }
    ]
  },
  {
    path: 'logging',
    label: 'Logging',
    area: 'Library',
    applies: 'reload',
    lead: "How the library's loggers filter, mirror and redact records.",
    fields: [
      {
        kind: 'select',
        section: 'logging',
        key: 'minLevel',
        label: 'Minimum level',
        options: LAB_LOG_LEVELS
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'mirrorErrorsToRum',
        label: 'Mirror errors to RUM'
      },
      {
        kind: 'levels',
        section: 'logging',
        key: 'levels',
        label: 'Logger levels'
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'redact',
        label: 'Redact log values'
      }
    ]
  },
  {
    path: 'privacy',
    label: 'Privacy & redaction',
    area: 'Library',
    applies: 'reload',
    lead: 'What the library redacts from everything it sends: long strings and stacks, URL queries, and the keys and values that match a pattern.',
    fields: [
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxStringLength',
        label: 'Longest string'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxKeys',
        label: 'Most keys'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxStackLength',
        label: 'Longest stack'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'includeStack',
        label: 'Include stacks'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'stripUrlQuery',
        label: 'Strip URL queries'
      },
      {
        kind: 'multi',
        section: 'redaction',
        key: 'scanValuePatterns',
        label: 'Value patterns scanned',
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
        label: 'Value transforms',
        options: Object.keys(LAB_VALUE_TRANSFORMS).map((name) => ({
          label: name,
          value: name
        }))
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraKeyPatterns',
        label: 'Extra key patterns, one RegExp per line'
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraValuePatterns',
        label: 'Extra value patterns, one RegExp per line'
      }
    ]
  },
  {
    path: 'event-inspector',
    label: 'Event Inspector',
    area: 'Library',
    applies: 'reload',
    lead: 'Whether the inspector is there and how it opens, and how much it keeps and shows.',
    fields: [
      {
        kind: 'select',
        section: 'start',
        key: 'inspector',
        label: 'Availability',
        options: INSPECTOR_MODES
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxEventsPerSection',
        label: 'Events kept per kind'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxPayloadCharsInView',
        label: 'Payload characters shown'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'captureBeforeOpen',
        label: 'Keep events from before opening'
      },
      {
        kind: 'shortcuts',
        section: 'inspector',
        key: 'shortcuts',
        label: 'Shortcuts'
      }
    ]
  },
  {
    path: 'rum-broker',
    label: 'RUM broker',
    area: 'Mock backend',
    applies: 'server',
    lead: "How the mock RUM broker answers /rum/init, and the RUM telemetries it names. The lab's server keeps them, for every tab.",
    fields: []
  },
  {
    path: 'app-monitor',
    label: 'App monitor',
    area: 'Mock backend',
    applies: 'server',
    lead: "The app monitor config the mock broker lays over its answer: the settings most worth trying, and the JSON, which has the rest and is what is sent. The lab's server keeps it, for every tab.",
    fields: [
      {
        kind: 'number',
        section: 'broker',
        key: 'sessionSampleRate',
        label: 'Session sample rate, 0 to 1',
        default: 1
      },
      {
        kind: 'number',
        section: 'broker',
        key: 'sessionEventLimit',
        label: 'Session event limit, 0 for none',
        default: 0
      },
      {
        kind: 'number',
        section: 'broker',
        key: 'dispatchInterval',
        label: 'Dispatch interval, ms',
        default: 2000
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'allowCookies',
        label: 'Allow cookies',
        default: true
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'enableXRay',
        label: 'X-Ray tracing',
        default: false
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'disableAutoPageView',
        label: 'Automatic page view off',
        default: false
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'recordResourceUrl',
        label: 'Record resource URLs',
        default: true
      },
      {
        kind: 'lines',
        section: 'broker',
        key: 'pagesToExclude',
        label: 'Pages to exclude, one RegExp per line',
        default: []
      },
      {
        kind: 'lines',
        section: 'broker',
        key: 'pagesToInclude',
        label: 'Pages to include, one RegExp per line',
        default: []
      }
    ]
  },
  {
    path: 'debug-flags',
    label: 'Debug flags',
    area: 'Diagnostics',
    applies: 'now',
    lead: 'Console lines for what is sent. The library reads them on every event, so they apply at once, without a reload, and are never waiting to be applied.',
    fields: []
  },
  {
    path: 'json',
    label: 'Configuration as JSON',
    area: 'Advanced',
    applies: 'reload',
    lead: "The library's settings from every section, as JSON. Edit it to paste a whole configuration, or to set what has no control.",
    fields: []
  },
  {
    path: 'effective',
    label: 'Effective configuration',
    area: 'Advanced',
    lead: 'What the library was given on this load, read back from its tokens.',
    fields: []
  }
];

/** The section with this path. */
export function labSettingsSection(path: string): LabSettingsSection {
  return LAB_SETTINGS_SECTIONS.find((section) => section.path === path)!;
}
