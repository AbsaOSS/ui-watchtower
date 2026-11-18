import { LAB_VALUE_TRANSFORMS, LabOptions } from './lab-options';
import { LabBrokerMode } from './lab-wire.service';

type Option = { label: string; value: string };

/**
 * A setting Settings offers as a control. `section` is where it is kept:
 * `start` for how the lab starts, `rum` for the mock broker's answer,
 * `broker` for its app monitor config, `debug` for the debug flags, and
 * otherwise its section of the `?config=` overlay. `multi` picks several of
 * its options; `lines` is a list of strings, one to a line; `levels`,
 * `shortcuts` and `telemetries` have editors of their own.
 */
export type LabField = {
  section: string;
  key: string;
  /** What it is, as people read it; its control adds the setting's name. */
  label: string;
  /** What it does, from the documentation of what it sets. */
  help: string;
  /** What the app monitor does with none given: broker settings only. */
  default?: unknown;
} & (
  | {
      kind:
        | 'switch'
        | 'number'
        | 'text'
        | 'lines'
        | 'levels'
        | 'shortcuts'
        | 'telemetries';
    }
  | { kind: 'select' | 'multi'; options: Option[] }
);

/** Kept elsewhere than in the `?config=` overlay. */
const OUTSIDE_OVERLAY = new Set(['start', 'rum', 'broker', 'debug']);

/** Whether a field writes into the `?config=` overlay, and so waits for its JSON. */
export function labInOverlay(field: LabField): boolean {
  return !OUTSIDE_OVERLAY.has(field.section);
}

/**
 * The setting's name as the JSON has it: `logging.minLevel` in the overlay,
 * `sessionSampleRate` in the app monitor config. Empty for the others,
 * which have no JSON.
 */
export function labSettingName(field: LabField): string {
  switch (field.section) {
    case 'start':
    case 'rum':
    case 'debug':
      return '';
    case 'broker':
      return field.key;
    default:
      return `${field.section}.${field.key}`;
  }
}

/**
 * A field's control label: what it is, then the setting's name as the JSON
 * has it, so the control and the JSON can be read together.
 */
export function labFieldLabel(field: LabField): string {
  const name = labSettingName(field);
  return name ? `${field.label} (${name})` : field.label;
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

export const LAB_DEBUG_FLAGS = [
  'debugScenario',
  'debugBI',
  'debugLogger'
] as const;
export type LabDebugFlag = (typeof LAB_DEBUG_FLAGS)[number];

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

/** What redaction being off for a concern leaves, as the library documents it. */
const REDACT_HELP =
  'Turned off, only the configurable scrubbing stops: key and value patterns, and URL queries. The built-in key denylist, size caps and value transforms still apply.';

/**
 * The sections of Settings, by what their settings change, each with the
 * controls it offers and what they do. The library's settings are the ones
 * the lab takes in its `?config=` overlay; the app monitor's are the ones
 * most worth trying, with the values the broker answers with, or the app
 * monitor takes, when none is given. Any others are the JSON's.
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
        label: 'Application name',
        help: 'The application, as each session records it.'
      },
      {
        kind: 'text',
        section: 'identity',
        key: 'environment',
        label: 'Environment',
        help: 'Where it is deployed: dev, qa, prod.'
      },
      {
        kind: 'text',
        section: 'identity',
        key: 'version',
        label: 'Version',
        help: "The application's version, such as 22.0.0."
      },
      {
        kind: 'text',
        section: 'identity',
        key: 'eventNamespace',
        label: 'Event namespace',
        help: 'The prefix of the event types the library sends: {namespace}.scenario, {namespace}.scenario.step and {namespace}.bi. com.uwt when empty.'
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
        help: "Where the library's telemetry goes: to the mock backend through the RUM sink, nowhere, or to the lab's own sink, given with provideUwtTelemetryDestination.",
        options: DESTINATIONS
      },
      {
        kind: 'select',
        section: 'start',
        key: 'channel',
        label: 'Broadcast channel',
        help: "The channel the shell hosts its fragments' telemetry on: its own, or the default one, shared by every tab, whose hosts elect one leader.",
        options: CHANNELS
      },
      {
        kind: 'switch',
        section: 'start',
        key: 'telemetry',
        label: 'Telemetry',
        help: 'Off, every service and destination is inert, through withTelemetryEnabled: nothing is recorded or sent.'
      },
      {
        kind: 'switch',
        section: 'lab',
        key: 'logBatching',
        label: 'Batch logs, sent on flush()',
        help: "The lab's log provider keeps the records, and sends them when the library flushes it."
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
        label: 'Default timeout, ms',
        help: 'After this long, a scenario still unsettled settles as timeout. 0 turns the default off; a scenario can still set its own.'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'emitLifecycleEvents',
        label: 'Lifecycle step events',
        help: "An event for each step, rather than one packed event when the scenario settles. They count against RUM's session event limit: for debugging, not production."
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'maxSteps',
        label: 'Step limit',
        help: 'Steps kept per scenario. Later ones are counted in stepCount but not stored, bounding a runaway loop.'
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'userTimings',
        label: 'User timings',
        help: "Scenarios and their steps as performance marks and measures, on DevTools' Performance track. The debugScenario flag turns them on too."
      },
      {
        kind: 'number',
        section: 'scenarios',
        key: 'markCleanupFallbackMs',
        label: 'Mark cleanup fallback, ms',
        help: "How long the marks of a scenario that never settles stay, with user timings on and no timeout. 0 keeps them for the page's life."
      },
      {
        kind: 'switch',
        section: 'scenarios',
        key: 'redact',
        label: 'Redact scenario payloads',
        help: `Whether scenario records are redacted. ${REDACT_HELP}`
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
        label: 'BI dedup window, ms',
        help: 'An identical event within this long of another is a double fire, and is dropped. 0 keeps every one.'
      },
      {
        kind: 'number',
        section: 'bi',
        key: 'dedupMaxKeys',
        label: 'BI dedup keys kept',
        help: 'Distinct events remembered before expired ones are swept, so a long session stays bounded.'
      },
      {
        kind: 'switch',
        section: 'bi',
        key: 'redact',
        label: 'Redact BI payloads',
        help: `Whether BI events are redacted. ${REDACT_HELP}`
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
        help: 'Records below this severity are discarded.',
        options: LAB_LOG_LEVELS
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'mirrorErrorsToRum',
        label: 'Mirror errors to RUM',
        help: "logger.error calls go to RUM as errors too, counting against the session's event budget with scenarios and BI events."
      },
      {
        kind: 'levels',
        section: 'logging',
        key: 'levels',
        label: 'Logger levels',
        help: 'A level of its own for a named logger, over the minimum level; the others keep the minimum.'
      },
      {
        kind: 'switch',
        section: 'logging',
        key: 'redact',
        label: 'Redact log values',
        help: `Whether log records are redacted. ${REDACT_HELP}`
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
        label: 'Longest string',
        help: 'A string value longer than this is truncated.'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxKeys',
        label: 'Most keys',
        help: 'Attributes kept on one payload; the rest are dropped.'
      },
      {
        kind: 'number',
        section: 'redaction',
        key: 'maxStackLength',
        label: 'Longest stack',
        help: 'A stack trace longer than this is truncated.'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'includeStack',
        label: 'Include stacks',
        help: 'Whether stack traces are captured at all.'
      },
      {
        kind: 'switch',
        section: 'redaction',
        key: 'stripUrlQuery',
        label: 'Strip URL queries',
        help: 'Query strings and fragments are stripped from URLs in string values.'
      },
      {
        kind: 'multi',
        section: 'redaction',
        key: 'scanValuePatterns',
        label: 'Value patterns scanned',
        help: 'Shapes of personal data looked for in values, besides the key denylist. Heuristics: phone is the noisiest; creditCard also needs a Luhn match.',
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
        help: 'Functions run on every string value after the patterns, for what no pattern can express. A failing one is skipped.',
        options: Object.keys(LAB_VALUE_TRANSFORMS).map((name) => ({
          label: name,
          value: name
        }))
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraKeyPatterns',
        label: 'Extra key patterns, one RegExp per line',
        help: 'Keys redacted besides the built-in denylist, matched against attribute names, ignoring case.'
      },
      {
        kind: 'lines',
        section: 'redaction',
        key: 'extraValuePatterns',
        label: 'Extra value patterns, one RegExp per line',
        help: 'Values redacted besides the scanned shapes: the content counterpart to the key patterns.'
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
        help: "Whether the inspector can be opened: with its keyboard shortcut as well as from the page, from the page's button only, or not at all.",
        options: INSPECTOR_MODES
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxEventsPerSection',
        label: 'Events kept per kind',
        help: 'Events kept of each kind: BI, scenarios, logs. The oldest of a kind go first, so a burst of one never pushes out another.'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'maxPayloadCharsInView',
        label: 'Payload characters shown',
        help: 'A payload longer than this, in characters, shows truncated, at most 65,536; the download has it in full.'
      },
      {
        kind: 'number',
        section: 'inspector',
        key: 'captureBeforeOpen',
        label: 'Keep events from before opening',
        help: "Events of each kind kept from the app's start, to show what happened before it opened. 0 keeps none, and spares copying every event."
      },
      {
        kind: 'shortcuts',
        section: 'inspector',
        key: 'shortcuts',
        label: 'Shortcuts',
        help: "The keys that open the inspector. With none, the page's button is the only way in."
      }
    ]
  },
  {
    path: 'rum-broker',
    label: 'RUM broker',
    area: 'Mock backend',
    applies: 'server',
    lead: "How the mock RUM broker answers /rum/init, and the RUM telemetries it names. The lab's server keeps them, for every tab.",
    fields: [
      {
        kind: 'select',
        section: 'rum',
        key: 'mode',
        label: 'Answer /rum/init with',
        help: 'How the broker answers the start of RUM: normally, turning RUM off, failing, or in one of the ways the RUM sink has to survive.',
        options: LAB_BROKER_MODES
      },
      {
        kind: 'telemetries',
        section: 'rum',
        key: 'telemetries',
        label: 'Telemetries',
        help: "RUM's own telemetry: the library's default is errors, performance and same-origin HTTP. With none, RUM records only page views, the session start and the library's events."
      }
    ]
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
        help: 'The share of sessions RUM records: 0 none, 1 every one.',
        default: 1
      },
      {
        kind: 'number',
        section: 'broker',
        key: 'sessionEventLimit',
        label: 'Session event limit, 0 for none',
        help: 'The most events RUM records in one session.',
        default: 0
      },
      {
        kind: 'number',
        section: 'broker',
        key: 'dispatchInterval',
        label: 'Dispatch interval, ms',
        help: 'How often RUM sends the events it has gathered.',
        default: 2000
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'allowCookies',
        label: 'Allow cookies',
        help: 'RUM keeps its session and user ids in cookies, cwr_s and cwr_u, so it can count sessions and returning users.',
        default: true
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'enableXRay',
        label: 'X-Ray tracing',
        help: 'An X-Ray trace for the page load and each HTTP request RUM records, with the trace header added to the requests.',
        default: false
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'disableAutoPageView',
        label: 'Automatic page view off',
        help: 'RUM records no page views of its own: the app records them.',
        default: false
      },
      {
        kind: 'switch',
        section: 'broker',
        key: 'recordResourceUrl',
        label: 'Record resource URLs',
        help: 'Whether RUM records the URLs of the resources the page downloads, which may hold personal data.',
        default: true
      },
      {
        kind: 'lines',
        section: 'broker',
        key: 'pagesToExclude',
        label: 'Pages to exclude, one RegExp per line',
        help: 'Pages RUM records nothing on; they win over the pages to include.',
        default: []
      },
      {
        kind: 'lines',
        section: 'broker',
        key: 'pagesToInclude',
        label: 'Pages to include, one RegExp per line',
        help: 'The pages RUM records; every page when there are none.',
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
    fields: [
      {
        kind: 'switch',
        section: 'debug',
        key: 'debugScenario',
        label: 'debugScenario',
        help: 'A line for each scenario event sent. Turns user timings on too.'
      },
      {
        kind: 'switch',
        section: 'debug',
        key: 'debugBI',
        label: 'debugBI',
        help: 'A line for each BI event sent.'
      },
      {
        kind: 'switch',
        section: 'debug',
        key: 'debugLogger',
        label: 'debugLogger',
        help: 'A line for each log record sent. Set from DevTools to logger names, such as checkout,cart, it prints only theirs; the switch then shows off.'
      }
    ]
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
