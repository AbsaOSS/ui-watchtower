import {
  computed,
  DOCUMENT,
  inject,
  Injectable,
  linkedSignal,
  signal
} from '@angular/core';
import {
  UWT_BI_TELEMETRY_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_LOG_CONFIG,
  UWT_REDACT_CONFIG,
  UWT_SCENARIO_TELEMETRY_CONFIG,
  UWT_TELEMETRY_IDENTITY,
  uwtIsDebugEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_EVENT_INSPECTOR_CONFIG
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { labCheckConfig } from './lab-config-check';
import { parseJsonObject } from './lab-json';
import { LAB_OPTIONS, labSearch, LabOptions } from './lab-options';
import {
  LAB_SETTINGS_SECTIONS,
  LabField,
  labSettingsSection,
  LabSettingsSection
} from './lab-settings-fields';
import { labDescribeShortcut, LabShortcut } from './lab-shortcuts.component';
import { labTelemetriesLabel, LabTelemetry, LabWire } from './lab-wire.service';

export const LAB_DEBUG_FLAGS = [
  'debugScenario',
  'debugBI',
  'debugLogger'
] as const;
export type LabDebugFlag = (typeof LAB_DEBUG_FLAGS)[number];

/** How the lab starts: its options, but the overlay. */
type LabStart = Omit<LabOptions, 'config'>;

/** A change made in Settings and not applied yet. */
export interface LabSettingsChange {
  /** The section it is made in. */
  section: LabSettingsSection;
  /** The setting, as people read it. */
  label: string;
  /** As applied, and as it will be; both empty when the JSON isn't an object. */
  from: string;
  to: string;
}

/** Why Apply didn't go ahead, and the section to fix it in. */
export interface LabSettingsProblem {
  section: LabSettingsSection;
  message: string;
}

/** The library's default telemetries, where an edited list starts. */
const DEFAULT_TELEMETRIES: LabTelemetry[] = ['errors', 'performance', 'http'];

const JSON_SECTION = labSettingsSection('json');
const BROKER_SECTION = labSettingsSection('rum-broker');
const MONITOR_SECTION = labSettingsSection('app-monitor');

/** Each field, by where it is kept, with the section it is in. */
const FIELDS = new Map(
  LAB_SETTINGS_SECTIONS.flatMap((section) =>
    section.fields.map(
      (field) => [`${field.section}.${field.key}`, { field, section }] as const
    )
  )
);

/**
 * What Settings will apply, edited in any of its sections: how the lab
 * starts, the library's settings as a `?config=` overlay, and the mock
 * broker's answer. They apply together, with a reload. Provided by the
 * Settings area, so it lasts while the sections change, and goes with it.
 */
@Injectable()
export class LabSettingsDraft {
  private readonly window = inject(DOCUMENT).defaultView!;
  private readonly options = inject(LAB_OPTIONS);
  private readonly wire = inject(LabWire);

  /** How the lab starts, to be: the load's own to begin with. */
  readonly start = signal<LabStart>(startOf(this.options));

  /** The settings in effect, which the controls show until changed. */
  private readonly inEffect: Record<string, Record<string, unknown>> = (() => {
    const inspector = inject(UWT_EVENT_INSPECTOR_CONFIG);
    return {
      identity: {
        ...inject(UWT_TELEMETRY_IDENTITY),
        eventNamespace: inject(UWT_TELEMETRY_IDENTITY).eventNamespace ?? ''
      },
      scenarios: { ...inject(UWT_SCENARIO_TELEMETRY_CONFIG) },
      logging: { levels: {}, ...inject(UWT_LOG_CONFIG) },
      bi: { ...inject(UWT_BI_TELEMETRY_CONFIG) },
      redaction: { ...inject(UWT_REDACT_CONFIG) },
      inspector: {
        maxEventsPerSection: inspector.maxEventsPerSection,
        maxPayloadCharsInView: inspector.maxPayloadCharsInView,
        shortcuts: inspector.shortcuts,
        captureBeforeOpen: inspector.captureBeforeOpen
      },
      lab: { logBatching: false }
    };
  })();

  /**
   * What each section takes, of the types they take: the library's defaults
   * over what is in effect, which an overlay in the address may have given
   * a value of the wrong type.
   */
  private readonly known: Record<string, Record<string, unknown>> = (() => {
    const library = UWT_DEFAULT_TELEMETRY_CONFIG;
    const inspector = UWT_DEFAULT_INSPECTOR_CONFIG;
    const defaults: Record<string, object> = {
      identity: { eventNamespace: library.eventNamespace },
      scenarios: library.scenario,
      logging: library.logs,
      bi: library.bi,
      redaction: library.redact,
      inspector: {
        maxEventsPerSection: inspector.maxEventsPerSection,
        maxPayloadCharsInView: inspector.maxPayloadCharsInView,
        captureBeforeOpen: inspector.captureBeforeOpen
      }
    };
    return Object.fromEntries(
      Object.entries(this.inEffect).map(([section, values]) => [
        section,
        { ...values, ...defaults[section] }
      ])
    );
  })();

  /** The overlay being edited: the one in effect, to start with. */
  readonly overlayText = signal(this.appliedText());
  readonly overlayError = signal('');
  /** The overlay as an object, or `undefined` while it isn't one. */
  readonly overlay = computed(() =>
    parseJsonObject(this.overlayText().trim() || '{}')
  );

  /** The broker's answer to be, starting from the one it gives now. */
  readonly mode = linkedSignal(() => this.wire.brokerMode());
  readonly telemetries = linkedSignal(() => this.wire.telemetries());
  readonly brokerText = linkedSignal(() =>
    JSON.stringify(this.wire.brokerConfig())
  );

  readonly brokerError = signal('');
  /** The broker's config as an object, or `undefined` while it isn't one. */
  readonly brokerObject = computed(() =>
    parseJsonObject(this.brokerText().trim() || '{}')
  );

  /** What the last Apply found wrong, until the JSON at fault is edited. */
  readonly problems = computed<LabSettingsProblem[]>(() => [
    ...(this.overlayError()
      ? [{ section: JSON_SECTION, message: this.overlayError() }]
      : []),
    ...(this.brokerError()
      ? [{ section: MONITOR_SECTION, message: this.brokerError() }]
      : [])
  ]);

  /** What applying would change, in the order of the sections. */
  readonly changes = computed<LabSettingsChange[]>(() =>
    [
      ...this.startChanges(),
      ...this.overlayChanges(),
      ...this.brokerChanges()
    ].sort(
      (a, b) =>
        LAB_SETTINGS_SECTIONS.indexOf(a.section) -
        LAB_SETTINGS_SECTIONS.indexOf(b.section)
    )
  );

  readonly debug = signal(this.readDebug());

  /** What the library was given, read back from its tokens. */
  readonly effective = JSON.stringify(
    {
      identity: inject(UWT_TELEMETRY_IDENTITY),
      scenarios: inject(UWT_SCENARIO_TELEMETRY_CONFIG),
      logging: inject(UWT_LOG_CONFIG),
      bi: inject(UWT_BI_TELEMETRY_CONFIG),
      redaction: inject(UWT_REDACT_CONFIG),
      inspector: inject(UWT_EVENT_INSPECTOR_CONFIG)
    },
    readable,
    2
  );

  /** A field's value: as the draft has it, or as it is without one. */
  value(field: LabField): unknown {
    switch (field.section) {
      case 'start':
        return this.start()[field.key as keyof LabStart];
      case 'broker':
        return this.brokerObject()?.[field.key] ?? field.default;
      default:
        return (
          (this.overlay()?.[field.section] as Record<string, unknown>)?.[
            field.key
          ] ?? this.inEffect[field.section][field.key]
        );
    }
  }

  /** Whether a field's control is off: while the JSON it writes into isn't an object. */
  disabled(field: LabField): boolean {
    switch (field.section) {
      case 'start':
        return false;
      case 'broker':
        return !this.brokerObject();
      default:
        return !this.overlay();
    }
  }

  /** Writes a control's value into the draft, which shows it. */
  set(field: LabField, value: unknown): void {
    if (field.section === 'start') {
      this.start.update((start) => ({ ...start, [field.key]: value }));
      return;
    }
    if (field.section === 'broker') {
      const config = this.brokerObject();
      if (config) {
        this.editBroker(JSON.stringify({ ...config, [field.key]: value }));
      }
      return;
    }
    const overlay = this.overlay();
    if (overlay) {
      const settings = overlay[field.section] as Record<string, unknown>;
      this.editOverlay(
        JSON.stringify(
          { ...overlay, [field.section]: { ...settings, [field.key]: value } },
          null,
          2
        )
      );
    }
  }

  setNumber(field: LabField, value: unknown): void {
    const number = Number(value);
    if (value !== '' && Number.isFinite(number)) {
      this.set(field, number);
    }
  }

  /** A text of lines into the list it stands for: blank lines are none. */
  setLines(field: LabField, text: string): void {
    this.set(
      field,
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }

  editOverlay(text: string): void {
    this.overlayText.set(text);
    this.overlayError.set('');
  }

  editBroker(text: string): void {
    this.brokerText.set(text);
    this.brokerError.set('');
  }

  /** Back to the library's default, or a list to edit that starts there. */
  useDefaultTelemetries(useDefault: boolean): void {
    this.telemetries.set(useDefault ? null : DEFAULT_TELEMETRIES);
  }

  /**
   * Sets the broker, then reloads with the overlay and how the lab is to
   * start. Nothing changes while either JSON is wrong.
   */
  async apply(): Promise<void> {
    const overlay = this.overlay();
    const brokerConfig = this.brokerObject();
    this.overlayError.set(
      overlay ? labCheckConfig(overlay, this.known) : 'Not a JSON object.'
    );
    this.brokerError.set(brokerConfig ? '' : 'Not a JSON object.');
    if (this.overlayError() || !overlay || !brokerConfig) {
      return;
    }
    await this.wire.setBrokerMode(this.mode());
    await this.wire.setTelemetries(this.telemetries());
    await this.wire.setBrokerConfig(brokerConfig);
    this.reload(overlay, this.start());
  }

  /** Every change dropped: back to what is applied. */
  discard(): void {
    this.start.set(startOf(this.options));
    this.editOverlay(this.appliedText());
    this.mode.set(this.wire.brokerMode());
    this.telemetries.set(this.wire.telemetries());
    this.editBroker(JSON.stringify(this.wire.brokerConfig()));
  }

  /** The lab's own settings, and the broker's default answer. */
  async reset(): Promise<void> {
    await this.wire.setBrokerMode('ok');
    await this.wire.setTelemetries(null);
    await this.wire.setBrokerConfig({});
    this.reload({});
  }

  setDebug(flag: LabDebugFlag, on: boolean): void {
    try {
      if (on) {
        this.window.localStorage.setItem(flag, 'true');
      } else {
        this.window.localStorage.removeItem(flag);
      }
    } catch {
      // Storage blocked: the flags stay as they were.
    }
    this.debug.set(this.readDebug());
  }

  private startChanges(): LabSettingsChange[] {
    const start = this.start();
    return (Object.keys(start) as (keyof LabStart)[])
      .filter((key) => start[key] !== this.options[key])
      .map((key) => {
        const { field, section } = FIELDS.get(`start.${key}`)!;
        return {
          section,
          label: field.label,
          from: show(this.options[key], field),
          to: show(start[key], field)
        };
      });
  }

  /**
   * The overlay's settings set otherwise than applied. One set to what it
   * already is, unset before, is no change; a section the lab doesn't take,
   * or one that isn't an object, is the JSON's to show.
   */
  private overlayChanges(): LabSettingsChange[] {
    const draft = this.overlay();
    if (!draft) {
      return [notAnObject(JSON_SECTION)];
    }
    const applied = this.options.config as Record<string, unknown>;
    const changes: LabSettingsChange[] = [];
    for (const name of keysOf(applied, draft)) {
      const inEffect = Object.hasOwn(this.inEffect, name)
        ? this.inEffect[name]
        : undefined;
      const before = applied[name] ?? {};
      const after = draft[name] ?? {};
      if (!inEffect || !isObject(before) || !isObject(after)) {
        if (!same(applied[name], draft[name])) {
          changes.push({
            section: JSON_SECTION,
            label: name,
            from: show(applied[name]),
            to: show(draft[name])
          });
        }
        continue;
      }
      for (const key of keysOf(before, after)) {
        const was = before[key] ?? inEffect[key];
        if (
          same(before[key], after[key]) ||
          (before[key] === undefined && same(after[key], was))
        ) {
          continue;
        }
        const found = FIELDS.get(`${name}.${key}`);
        changes.push({
          section: found?.section ?? JSON_SECTION,
          label: found?.field.label ?? `${name}.${key}`,
          from: show(was, found?.field),
          to: show(after[key], found?.field)
        });
      }
    }
    return changes;
  }

  /** The broker's answer, set otherwise than the server has it. */
  private brokerChanges(): LabSettingsChange[] {
    const changes: LabSettingsChange[] = [];
    if (this.mode() !== this.wire.brokerMode()) {
      changes.push({
        section: BROKER_SECTION,
        label: 'Answer /rum/init with',
        from: this.wire.brokerMode(),
        to: this.mode()
      });
    }
    if (!same(this.telemetries(), this.wire.telemetries())) {
      changes.push({
        section: BROKER_SECTION,
        label: 'Telemetries',
        from: labTelemetriesLabel(this.wire.telemetries()),
        to: labTelemetriesLabel(this.telemetries())
      });
    }
    const draft = this.brokerObject();
    if (!draft) {
      return [...changes, notAnObject(MONITOR_SECTION)];
    }
    const applied = this.wire.brokerConfig();
    for (const key of keysOf(applied, draft)) {
      const field = FIELDS.get(`broker.${key}`)?.field;
      const was = applied[key] ?? field?.default;
      if (
        same(applied[key], draft[key]) ||
        (applied[key] === undefined &&
          field !== undefined &&
          same(draft[key], was))
      ) {
        continue;
      }
      changes.push({
        section: MONITOR_SECTION,
        label: field?.label ?? key,
        from: show(was, field),
        to: show(draft[key], field)
      });
    }
    return changes;
  }

  private appliedText(): string {
    return JSON.stringify(this.options.config, null, 2);
  }

  /** Starts the lab again, with `config` and how it is to start: as now, by default. */
  private reload(
    config: Record<string, unknown>,
    start: LabStart = startOf(this.options)
  ): void {
    this.window.location.assign(
      `${this.window.location.pathname}${labSearch({ ...start, config })}`
    );
  }

  /** As the library reads them: a list of logger names is not "on". */
  private readDebug(): Record<LabDebugFlag, boolean> {
    return {
      debugScenario: uwtIsDebugEnabled('debugScenario'),
      debugBI: uwtIsDebugEnabled('debugBI'),
      debugLogger: uwtIsDebugEnabled('debugLogger')
    };
  }
}

function startOf({ destination, telemetry, channel, inspector }: LabOptions) {
  return { destination, telemetry, channel, inspector };
}

function notAnObject(section: LabSettingsSection): LabSettingsChange {
  return { section, label: 'Not a JSON object yet', from: '', to: '' };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The keys of either object, once each. */
function keysOf(a: object, b: object): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

/**
 * Whether two settings are the same, as the JSON would have them: a pattern
 * as its source, a transform as its name, an object's keys in any order.
 */
function same(a: unknown, b: unknown): boolean {
  return comparable(a) === comparable(b);
}

function comparable(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) =>
      v instanceof RegExp
        ? v.source
        : typeof v === 'function'
          ? v.name
          : isObject(v)
            ? Object.fromEntries(
                Object.keys(v)
                  .sort()
                  .map((key) => [key, v[key]])
              )
            : v
    ) ?? 'undefined'
  );
}

/** A setting's value as the review shows it. */
function show(value: unknown, field?: LabField): string {
  if (value === undefined) {
    return 'not set';
  }
  if (field?.kind === 'shortcuts' && Array.isArray(value)) {
    return (
      value
        .map((shortcut: LabShortcut) => labDescribeShortcut(shortcut))
        .join(', ') || 'none'
    );
  }
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  if (value instanceof RegExp) {
    return value.source;
  }
  if (typeof value === 'function') {
    return value.name;
  }
  if (Array.isArray(value)) {
    return value.map((item) => show(item)).join(', ') || 'none';
  }
  if (isObject(value)) {
    return (
      Object.entries(value)
        .map(([key, item]) => `${key}: ${show(item)}`)
        .join(', ') || 'none'
    );
  }
  return value === '' ? 'empty' : String(value);
}

/** RegExps and functions, readable in JSON. */
function readable(_key: string, value: unknown): unknown {
  if (value instanceof RegExp) {
    return String(value);
  }
  return typeof value === 'function'
    ? `ƒ ${value.name || '(anonymous)'}`
    : value;
}
