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
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  UWT_EVENT_INSPECTOR_CONFIG
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { labCheckConfig } from './lab-config-check';
import { parseJsonObject } from './lab-json';
import {
  LAB_DEFAULTS,
  LAB_OPTIONS,
  labOptions,
  labSearch,
  LabOptions
} from './lab-options';
import {
  LAB_DEBUG_FLAGS,
  LAB_SETTINGS_SECTIONS,
  LabDebugFlag,
  LabField,
  labSettingsSection,
  LabSettingsSection
} from './lab-settings-fields';
import { labDescribeShortcut, LabShortcut } from './lab-shortcuts.component';
import {
  LabBrokerMode,
  labTelemetriesLabel,
  LabTelemetry,
  LabWire
} from './lab-wire.service';

/** How the lab starts: its options, but the overlay. */
type LabStart = Omit<LabOptions, 'config'>;

/**
 * A setting in one of Settings' lists: changed and not applied yet, or one
 * this load runs with otherwise than the lab's default.
 */
export interface LabSettingsEntry {
  /** Where it is kept: {@link labSettingId} for a field's. */
  id: string;
  /** The section it is in. */
  section: LabSettingsSection;
  /** The setting, as people read it. */
  label: string;
  /**
   * Not applied: as applied, and as it will be. Modified: the lab's default,
   * and as it is. Both empty when the JSON isn't an object.
   */
  from: string;
  to: string;
  /**
   * Takes it back: a change to what is applied; a modified setting to the
   * lab's default, which then waits to be applied — a debug flag at once.
   */
  revert: () => void;
}

/** Why Apply didn't go ahead, and the section to fix it in. */
export interface LabSettingsProblem {
  section: LabSettingsSection;
  message: string;
}

/** Where a field is kept: `logging.minLevel`, `start.destination`, `broker.allowCookies`. */
export function labSettingId(field: LabField): string {
  return `${field.section}.${field.key}`;
}

/** The library's default telemetries, where an edited list starts. */
const DEFAULT_TELEMETRIES: LabTelemetry[] = ['errors', 'performance', 'http'];

const JSON_SECTION = labSettingsSection('json');
const BROKER_SECTION = labSettingsSection('rum-broker');
const MONITOR_SECTION = labSettingsSection('app-monitor');
const DEBUG_SECTION = labSettingsSection('debug-flags');

/** Each field, by where it is kept, with the section it is in. */
const FIELDS = new Map(
  LAB_SETTINGS_SECTIONS.flatMap((section) =>
    section.fields.map(
      (field) => [labSettingId(field), { field, section }] as const
    )
  )
);

/** How the lab starts with no options in the address. */
const START_DEFAULTS = startOf(labOptions(''));

/** Each overlay section's settings with no `?config=`: the lab's own, over the library's defaults. */
const OVERLAY_DEFAULTS: Record<string, Record<string, unknown>> = {
  identity: {
    eventNamespace: UWT_DEFAULT_TELEMETRY_CONFIG.eventNamespace,
    ...LAB_DEFAULTS.identity
  },
  scenarios: {
    ...UWT_DEFAULT_TELEMETRY_CONFIG.scenario,
    ...LAB_DEFAULTS.scenarios
  },
  logging: { ...UWT_DEFAULT_TELEMETRY_CONFIG.logs, ...LAB_DEFAULTS.logging },
  bi: { ...UWT_DEFAULT_TELEMETRY_CONFIG.bi },
  redaction: {
    ...UWT_DEFAULT_TELEMETRY_CONFIG.redact,
    ...LAB_DEFAULTS.redaction
  },
  inspector: {
    maxEventsPerSection: UWT_DEFAULT_INSPECTOR_CONFIG.maxEventsPerSection,
    maxPayloadCharsInView: UWT_DEFAULT_INSPECTOR_CONFIG.maxPayloadCharsInView,
    captureBeforeOpen: UWT_DEFAULT_INSPECTOR_CONFIG.captureBeforeOpen,
    shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS
  },
  lab: { logBatching: false }
};

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
  /** The overlay this load was started with. */
  private readonly applied = this.options.config as Record<string, unknown>;

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

  readonly debug = signal(this.readDebug());

  /** What applying would change, in the order of the sections. */
  readonly changes = computed(() =>
    bySection([
      ...this.startChanges(),
      ...this.overlayChanges(),
      ...this.brokerChanges()
    ])
  );

  /** What this load runs with otherwise than the lab's defaults. */
  readonly modified = computed(() =>
    bySection([
      ...this.startModified(),
      ...this.overlayModified(),
      ...this.brokerModified(),
      ...this.debugModified()
    ])
  );

  /** The changes not applied, by their setting's id. */
  readonly changeById = computed(
    () => new Map(this.changes().map((entry) => [entry.id, entry]))
  );

  /** The modified settings, by their id. */
  readonly modifiedById = computed(
    () => new Map(this.modified().map((entry) => [entry.id, entry]))
  );

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

  /**
   * A field's value as the next load will have it: as the draft has it, as
   * it is in effect where neither sets it, or the lab's default where the
   * draft takes it out.
   */
  value(field: LabField): unknown {
    switch (field.section) {
      case 'start':
        return this.start()[field.key as keyof LabStart];
      case 'rum':
        return field.key === 'mode' ? this.mode() : this.telemetries();
      case 'broker':
        return this.brokerObject()?.[field.key] ?? field.default;
      case 'debug':
        return this.debug()[field.key as LabDebugFlag];
      default: {
        const { section, key } = field;
        const drafted = settingIn(this.overlay(), section, key);
        if (drafted !== undefined) {
          return drafted;
        }
        return settingIn(this.applied, section, key) === undefined
          ? this.inEffect[section][key]
          : own(OVERLAY_DEFAULTS, section)?.[key];
      }
    }
  }

  /** Whether a field's control is off: while the JSON it writes into isn't an object. */
  disabled(field: LabField): boolean {
    switch (field.section) {
      case 'broker':
        return !this.brokerObject();
      case 'start':
      case 'rum':
      case 'debug':
        return false;
      default:
        return !this.overlay();
    }
  }

  /**
   * Writes a control's value into the draft, which shows it — but a debug
   * flag's, which applies at once.
   */
  set(field: LabField, value: unknown): void {
    switch (field.section) {
      case 'start':
        this.setStart(field.key as keyof LabStart, value);
        return;
      case 'rum':
        if (field.key === 'mode') {
          this.mode.set(value as LabBrokerMode);
        } else {
          this.telemetries.set(value as LabTelemetry[] | null);
        }
        return;
      case 'broker':
        this.putBroker(field.key, value);
        return;
      case 'debug':
        this.setDebug(field.key as LabDebugFlag, !!value);
        return;
      default:
        this.putOverlay(field.section, field.key, value);
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

  private startChanges(): LabSettingsEntry[] {
    const start = this.start();
    return startKeys()
      .filter((key) => start[key] !== this.options[key])
      .map((key) =>
        this.startEntry(key, this.options[key], start[key], () =>
          this.setStart(key, this.options[key])
        )
      );
  }

  private startModified(): LabSettingsEntry[] {
    return startKeys()
      .filter((key) => this.options[key] !== START_DEFAULTS[key])
      .map((key) =>
        this.startEntry(key, START_DEFAULTS[key], this.options[key], () =>
          this.setStart(key, START_DEFAULTS[key])
        )
      );
  }

  /**
   * The overlay's settings set otherwise than applied. One set to what it
   * already is, unset before, is no change; a section the lab doesn't take,
   * or one that isn't an object, is the JSON's to show.
   */
  private overlayChanges(): LabSettingsEntry[] {
    const draft = this.overlay();
    if (!draft) {
      return [
        notAnObject('json', JSON_SECTION, () =>
          this.editOverlay(this.appliedText())
        )
      ];
    }
    const applied = this.applied;
    const entries: LabSettingsEntry[] = [];
    for (const name of keysOf(applied, draft)) {
      const inEffect = own(this.inEffect, name);
      const before = applied[name] ?? {};
      const after = draft[name] ?? {};
      if (!inEffect || !isObject(before) || !isObject(after)) {
        if (!same(applied[name], draft[name])) {
          entries.push({
            id: name,
            section: JSON_SECTION,
            label: name,
            from: show(applied[name]),
            to: show(draft[name]),
            revert: () => this.putOverlaySection(name, applied[name])
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
        entries.push(
          this.overlayEntry(
            name,
            key,
            was,
            after[key] ?? own(OVERLAY_DEFAULTS, name)?.[key],
            () => this.putOverlay(name, key, before[key])
          )
        );
      }
    }
    return entries;
  }

  /** The overlay's settings this load runs with otherwise than the lab's defaults. */
  private overlayModified(): LabSettingsEntry[] {
    const entries: LabSettingsEntry[] = [];
    for (const [name, settings] of Object.entries(this.applied)) {
      const defaults = own(OVERLAY_DEFAULTS, name);
      if (!defaults || !isObject(settings)) {
        entries.push({
          id: name,
          section: JSON_SECTION,
          label: name,
          from: show(undefined),
          to: show(settings),
          revert: () => this.putOverlaySection(name, undefined)
        });
        continue;
      }
      for (const [key, value] of Object.entries(settings)) {
        if (!same(value, defaults[key])) {
          entries.push(
            this.overlayEntry(name, key, defaults[key], value, () =>
              this.putOverlay(name, key, undefined)
            )
          );
        }
      }
    }
    return entries;
  }

  /** The broker's answer, set otherwise than the server has it. */
  private brokerChanges(): LabSettingsEntry[] {
    const entries: LabSettingsEntry[] = [];
    const mode = this.wire.brokerMode();
    if (this.mode() !== mode) {
      entries.push(modeEntry(mode, this.mode(), () => this.mode.set(mode)));
    }
    const telemetries = this.wire.telemetries();
    if (!same(this.telemetries(), telemetries)) {
      entries.push(
        telemetriesEntry(telemetries, this.telemetries(), () =>
          this.telemetries.set(telemetries)
        )
      );
    }
    const draft = this.brokerObject();
    if (!draft) {
      return [
        ...entries,
        notAnObject('broker-json', MONITOR_SECTION, () =>
          this.editBroker(JSON.stringify(this.wire.brokerConfig()))
        )
      ];
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
      entries.push(
        brokerEntry(key, was, draft[key] ?? field?.default, () =>
          this.putBroker(key, applied[key])
        )
      );
    }
    return entries;
  }

  /** The broker's answer, as the server has it, otherwise than by default. */
  private brokerModified(): LabSettingsEntry[] {
    const entries: LabSettingsEntry[] = [];
    const mode = this.wire.brokerMode();
    if (mode !== 'ok') {
      entries.push(modeEntry('ok', mode, () => this.mode.set('ok')));
    }
    const telemetries = this.wire.telemetries();
    if (telemetries !== null) {
      entries.push(
        telemetriesEntry(null, telemetries, () => this.telemetries.set(null))
      );
    }
    for (const [key, value] of Object.entries(this.wire.brokerConfig())) {
      const field = FIELDS.get(`broker.${key}`)?.field;
      if (!field || !same(value, field.default)) {
        entries.push(
          brokerEntry(key, field?.default, value, () =>
            this.putBroker(key, undefined)
          )
        );
      }
    }
    return entries;
  }

  /** The debug flags that are on: off by default, and back off at once. */
  private debugModified(): LabSettingsEntry[] {
    const debug = this.debug();
    return LAB_DEBUG_FLAGS.filter((flag) => debug[flag]).map((flag) => ({
      id: `debug.${flag}`,
      section: DEBUG_SECTION,
      label: flag,
      from: 'off',
      to: 'on',
      revert: () => this.setDebug(flag, false)
    }));
  }

  private startEntry(
    key: keyof LabStart,
    from: unknown,
    to: unknown,
    revert: () => void
  ): LabSettingsEntry {
    const { field, section } = FIELDS.get(`start.${key}`)!;
    return {
      id: labSettingId(field),
      section,
      label: field.label,
      from: show(from, field),
      to: show(to, field),
      revert
    };
  }

  private overlayEntry(
    name: string,
    key: string,
    from: unknown,
    to: unknown,
    revert: () => void
  ): LabSettingsEntry {
    const found = FIELDS.get(`${name}.${key}`);
    return {
      id: `${name}.${key}`,
      section: found?.section ?? JSON_SECTION,
      label: found?.field.label ?? `${name}.${key}`,
      from: show(from, found?.field),
      to: show(to, found?.field),
      revert
    };
  }

  private setStart(key: keyof LabStart, value: unknown): void {
    this.start.update((start) => ({ ...start, [key]: value }));
  }

  /**
   * Sets one of the overlay's settings in the draft; `undefined` takes it
   * out, and its section with it once empty.
   */
  private putOverlay(name: string, key: string, value: unknown): void {
    const overlay = this.overlay();
    if (!overlay) {
      return;
    }
    const current = overlay[name];
    const settings = isObject(current) ? current : {};
    const next =
      value === undefined
        ? without(settings, key)
        : { ...settings, [key]: value };
    this.putOverlaySection(name, Object.keys(next).length ? next : undefined);
  }

  /** Sets a whole section of the overlay in the draft; `undefined` takes it out. */
  private putOverlaySection(name: string, value: unknown): void {
    const overlay = this.overlay();
    if (overlay) {
      this.editOverlay(
        JSON.stringify(
          value === undefined
            ? without(overlay, name)
            : { ...overlay, [name]: value },
          null,
          2
        )
      );
    }
  }

  /** Sets one of the broker's settings in the draft; `undefined` takes it out. */
  private putBroker(key: string, value: unknown): void {
    const config = this.brokerObject();
    if (config) {
      this.editBroker(
        JSON.stringify(
          value === undefined
            ? without(config, key)
            : { ...config, [key]: value }
        )
      );
    }
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

function startOf({
  destination,
  telemetry,
  channel,
  inspector
}: LabOptions): LabStart {
  return { destination, telemetry, channel, inspector };
}

function startKeys(): (keyof LabStart)[] {
  return Object.keys(START_DEFAULTS) as (keyof LabStart)[];
}

function modeEntry(
  from: LabBrokerMode,
  to: LabBrokerMode,
  revert: () => void
): LabSettingsEntry {
  return {
    id: 'rum.mode',
    section: BROKER_SECTION,
    label: 'Answer /rum/init with',
    from,
    to,
    revert
  };
}

function telemetriesEntry(
  from: readonly LabTelemetry[] | null,
  to: readonly LabTelemetry[] | null,
  revert: () => void
): LabSettingsEntry {
  const text = (telemetries: readonly LabTelemetry[] | null) =>
    telemetries === null
      ? "the library's default"
      : labTelemetriesLabel(telemetries);
  return {
    id: 'rum.telemetries',
    section: BROKER_SECTION,
    label: 'Telemetries',
    from: text(from),
    to: text(to),
    revert
  };
}

function brokerEntry(
  key: string,
  from: unknown,
  to: unknown,
  revert: () => void
): LabSettingsEntry {
  const field = FIELDS.get(`broker.${key}`)?.field;
  return {
    id: `broker.${key}`,
    section: MONITOR_SECTION,
    label: field?.label ?? key,
    from: show(from, field),
    to: show(to, field),
    revert
  };
}

function notAnObject(
  id: string,
  section: LabSettingsSection,
  revert: () => void
): LabSettingsEntry {
  return {
    id,
    section,
    label: 'Not a JSON object yet',
    from: '',
    to: '',
    revert
  };
}

/** In the order of the sections, and of the settings within each. */
function bySection(entries: LabSettingsEntry[]): LabSettingsEntry[] {
  return entries.sort(
    (a, b) =>
      LAB_SETTINGS_SECTIONS.indexOf(a.section) -
      LAB_SETTINGS_SECTIONS.indexOf(b.section)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** One setting of an overlay: `undefined` where it isn't set, or the overlay isn't an object. */
function settingIn(
  overlay: Record<string, unknown> | undefined,
  section: string,
  key: string
): unknown {
  const settings = overlay?.[section];
  return isObject(settings) ? settings[key] : undefined;
}

/** An object's own property: what every object inherits, `toString`, is none. */
function own<T>(object: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function without(
  object: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const { [key]: _gone, ...rest } = object;
  return rest;
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

/** A setting's value as the lists show it. */
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
