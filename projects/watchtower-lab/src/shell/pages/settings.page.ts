import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  inject,
  linkedSignal,
  signal
} from '@angular/core';
import {
  UWT_BI_TELEMETRY_CONFIG,
  UWT_LOG_CONFIG,
  UWT_REDACT_CONFIG,
  UWT_SCENARIO_TELEMETRY_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_TELEMETRY_IDENTITY,
  uwtIsDebugEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_EVENT_INSPECTOR_CONFIG
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import {
  CpsButtonComponent,
  CpsInputComponent,
  CpsSelectComponent,
  CpsSwitchComponent,
  CpsTextareaComponent
} from 'cps-ui-kit';
import { labCheckConfig } from '../../lab/lab-config-check';
import { parseJsonObject } from '../../lab/lab-json';
import { labSearch, LabOptions } from '../../lab/lab-options';
import { LabLoggerLevelsComponent } from '../../lab/lab-logger-levels.component';
import {
  LAB_BROKER_FIELDS,
  LAB_FIELD_GROUPS,
  LabBrokerField,
  LabField
} from '../../lab/lab-settings-fields';
import {
  LabShortcut,
  LabShortcutsComponent
} from '../../lab/lab-shortcuts.component';
import {
  LAB_TELEMETRIES,
  LabBrokerMode,
  LabTelemetry,
  LabWire
} from '../../lab/lab-wire.service';
import { LAB_OPTIONS } from '../shell.config';

const DEBUG_FLAGS = ['debugScenario', 'debugBI', 'debugLogger'] as const;

/** How the lab starts; each is a query-string option, read once at startup. */
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
  { label: 'noshortcut — open it from the page', value: 'noshortcut' },
  { label: 'off — disabled', value: 'off' }
];
type DebugFlag = (typeof DEBUG_FLAGS)[number];

const BROKER_MODES: { label: string; value: LabBrokerMode }[] = [
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

/** The library's default telemetries, where an edited list starts. */
const DEFAULT_TELEMETRIES: LabTelemetry[] = ['errors', 'performance', 'http'];

@Component({
  selector: 'lab-settings-page',
  imports: [
    CpsButtonComponent,
    CpsInputComponent,
    CpsSelectComponent,
    CpsSwitchComponent,
    CpsTextareaComponent,
    LabLoggerLevelsComponent,
    LabShortcutsComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Settings</h1>
      <p>
        What the next load runs with: how the lab starts, the library's settings
        — a <code>?config=</code> overlay on the lab's own — and the mock RUM
        broker's answer. They apply together, with a reload.
      </p>

      <div class="lab-card">
        <h2>Run</h2>
        <p>How the lab starts: query-string options, read once at startup.</p>
        <div class="lab-fields">
          <cps-select
            label="Destination (?destination=)"
            [options]="destinations"
            [returnObject]="false"
            [value]="destination()"
            width="26rem"
            (valueChanged)="destination.set($event)" />
          <cps-select
            label="Broadcast channel (?channel=)"
            [options]="channels"
            [returnObject]="false"
            [value]="channel()"
            width="26rem"
            (valueChanged)="channel.set($event)" />
          <cps-select
            label="Event Inspector (?inspector=)"
            [options]="inspectorModes"
            [returnObject]="false"
            [value]="inspector()"
            width="26rem"
            (valueChanged)="inspector.set($event)" />
          <div class="lab-switches">
            <cps-switch
              label="Telemetry (?telemetry=)"
              [value]="telemetry()"
              (valueChanged)="telemetry.set($event)" />
            <cps-switch
              label="Batch logs, sent on flush() (lab.logBatching)"
              [value]="!!setting('lab', 'logBatching')"
              [disabled]="!overlay()"
              (valueChanged)="set('lab', 'logBatching', $event)" />
          </div>
        </div>
      </div>

      @for (group of groups; track group.title) {
        <div class="lab-card">
          <h2>{{ group.title }}</h2>
          <div class="lab-fields">
            @for (field of group.fields; track field.key) {
              @switch (field.kind) {
                @case ('switch') {
                  <cps-switch
                    [label]="field.label"
                    [value]="!!setting(field.section, field.key)"
                    [disabled]="!overlay()"
                    (valueChanged)="set(field.section, field.key, $event)" />
                }
                @case ('number') {
                  <cps-input
                    type="number"
                    [label]="field.label"
                    width="26rem"
                    [value]="'' + setting(field.section, field.key)"
                    [disabled]="!overlay()"
                    (valueChanged)="
                      setNumber(field.section, field.key, $event)
                    " />
                }
                @case ('text') {
                  <cps-input
                    [label]="field.label"
                    width="26rem"
                    [value]="'' + (setting(field.section, field.key) ?? '')"
                    [disabled]="!overlay()"
                    (valueChanged)="set(field.section, field.key, $event)" />
                }
                @case ('select') {
                  <cps-select
                    [label]="field.label"
                    [options]="selectOptions(field)"
                    [returnObject]="false"
                    [value]="'' + setting(field.section, field.key)"
                    width="26rem"
                    [disabled]="!overlay()"
                    (valueChanged)="set(field.section, field.key, $event)" />
                }
                @case ('multi') {
                  <cps-select
                    [label]="field.label"
                    [options]="selectOptions(field)"
                    [returnObject]="false"
                    [multiple]="true"
                    [chips]="true"
                    [value]="list(setting(field.section, field.key))"
                    width="26rem"
                    [disabled]="!overlay()"
                    (valueChanged)="set(field.section, field.key, $event)" />
                }
                @case ('lines') {
                  <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
                  <cps-textarea
                    ngSkipHydration
                    [label]="field.label"
                    [rows]="3"
                    width="26rem"
                    [value]="
                      list(setting(field.section, field.key)).join(
                        '
'
                      )
                    "
                    [disabled]="!overlay()"
                    (valueChanged)="
                      setLines(field.section, field.key, $event)
                    " />
                }
                @case ('levels') {
                  <div class="lab-field-wide">
                    <p class="lab-field-wide__label">{{ field.label }}</p>
                    <lab-logger-levels
                      [levels]="levelsOf(setting(field.section, field.key))"
                      [disabled]="!overlay()"
                      (changed)="set(field.section, field.key, $event)" />
                  </div>
                }
                @case ('shortcuts') {
                  <div class="lab-field-wide">
                    <p class="lab-field-wide__label">{{ field.label }}</p>
                    <lab-shortcuts
                      [shortcuts]="
                        shortcutsOf(setting(field.section, field.key))
                      "
                      [disabled]="!overlay()"
                      (changed)="set(field.section, field.key, $event)" />
                  </div>
                }
              }
            }
          </div>
        </div>
      }

      <div class="lab-card">
        <h2>The ?config= overlay</h2>
        <p>
          What the controls above write, and what more the lab takes: edit it
          here for anything they don't cover, such as patterns and loggers.
        </p>
        <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
        <cps-textarea
          ngSkipHydration
          label="?config= (JSON)"
          hint="Patterns are RegExp sources; the one value transform is mask-order-ids."
          [rows]="8"
          [value]="draft()"
          [error]="error()"
          (valueChanged)="edit($event)" />
      </div>

      <div class="lab-card">
        <h2>Mock RUM broker</h2>
        <cps-select
          label="Answer /rum/init with"
          [options]="modes"
          [returnObject]="false"
          [value]="mode()"
          width="26rem"
          (valueChanged)="mode.set($event)" />
        <p>
          RUM's own telemetry: the library's default is errors, performance and
          same-origin HTTP. With none, RUM records only page views, the session
          start and the library's events.
        </p>
        <div class="lab-switches">
          <cps-switch
            label="The library's default"
            [value]="telemetries() === null"
            (valueChanged)="useDefault($event)" />
        </div>
        @if (telemetries(); as chosen) {
          <cps-select
            label="Telemetries"
            placeholder="None"
            [options]="telemetryOptions"
            [returnObject]="false"
            [multiple]="true"
            [selectAll]="true"
            [chips]="true"
            [value]="chosen"
            width="26rem"
            (valueChanged)="telemetries.set($event)" />
        }
        <p>
          The app monitor settings most worth trying; the JSON below has the
          rest, and is what is sent.
        </p>
        <div class="lab-fields">
          @for (field of brokerFields; track field.key) {
            @switch (field.kind) {
              @case ('switch') {
                <cps-switch
                  [label]="field.label"
                  [value]="!!brokerSetting(field)"
                  [disabled]="!brokerObject()"
                  (valueChanged)="setBroker(field.key, $event)" />
              }
              @case ('number') {
                <cps-input
                  type="number"
                  [label]="field.label"
                  width="26rem"
                  [value]="'' + brokerSetting(field)"
                  [disabled]="!brokerObject()"
                  (valueChanged)="setBrokerNumber(field.key, $event)" />
              }
              @case ('lines') {
                <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
                <cps-textarea
                  ngSkipHydration
                  [label]="field.label"
                  [rows]="2"
                  width="26rem"
                  [value]="
                    list(brokerSetting(field)).join(
                      '
'
                    )
                  "
                  [disabled]="!brokerObject()"
                  (valueChanged)="setBrokerLines(field.key, $event)" />
              }
            }
          }
        </div>
        <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
        <cps-textarea
          ngSkipHydration
          label="Laid over the app monitor config (JSON)"
          width="26rem"
          [rows]="3"
          [value]="brokerConfig()"
          [error]="brokerConfigError()"
          (valueChanged)="brokerConfig.set($event)" />
      </div>

      <div class="lab-actions lab-apply-bar">
        <cps-button label="Apply and reload" (clicked)="apply()" />
        <cps-button
          label="Back to the lab's settings"
          type="outlined"
          (clicked)="reset()" />
      </div>

      <div class="lab-card">
        <h2>Debug flags</h2>
        <p>
          Console lines for what is sent. The library reads them on every event,
          so they apply at once, without a reload.
        </p>
        <div class="lab-switches">
          @for (flag of flags; track flag) {
            <cps-switch
              [label]="flag"
              [value]="debug()[flag]"
              (valueChanged)="setDebug(flag, $event)" />
          }
        </div>
      </div>

      <div class="lab-card">
        <h2>In effect</h2>
        <pre
          class="lab-readout"
          tabindex="0"
          role="region"
          aria-label="Settings in effect"
          >{{ effective }}</pre>
      </div>
    </section>
  `
})
export class SettingsPage {
  protected readonly flags = DEBUG_FLAGS;
  protected readonly groups = LAB_FIELD_GROUPS;
  protected readonly brokerFields = LAB_BROKER_FIELDS;
  protected readonly destinations = DESTINATIONS;
  protected readonly channels = CHANNELS;
  protected readonly inspectorModes = INSPECTOR_MODES;
  protected readonly modes = BROKER_MODES;
  protected readonly telemetryOptions = LAB_TELEMETRIES.map((t) => ({
    label: t,
    value: t
  }));

  private readonly window = inject(DOCUMENT).defaultView!;
  private readonly options = inject(LAB_OPTIONS);
  private readonly wire = inject(LabWire);

  /** How the lab starts, to be: the load's own to begin with. */
  protected readonly destination = signal(this.options.destination);
  protected readonly channel = signal(this.options.channel);
  protected readonly inspector = signal(this.options.inspector);
  protected readonly telemetry = signal(this.options.telemetry);

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
  protected readonly draft = signal(
    JSON.stringify(this.options.config, null, 2)
  );

  protected readonly error = signal('');
  /** The draft as an object, or `undefined` while it isn't one. */
  protected readonly overlay = computed(() =>
    parseJsonObject(this.draft().trim() || '{}')
  );

  /** The broker's answer to be, starting from the one it gives now. */
  protected readonly mode = linkedSignal(() => this.wire.brokerMode());
  protected readonly telemetries = linkedSignal(() => this.wire.telemetries());
  protected readonly brokerConfig = linkedSignal(() =>
    JSON.stringify(this.wire.brokerConfig())
  );

  protected readonly brokerConfigError = signal('');

  /** The broker's config as the draft has it, or `undefined` while it isn't an object. */
  protected readonly brokerObject = computed(() =>
    parseJsonObject(this.brokerConfig().trim() || '{}')
  );

  protected readonly debug = signal(this.readDebug());

  /** What the library was given, read back from its tokens. */
  protected readonly effective = JSON.stringify(
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

  protected selectOptions(field: LabField): { label: string; value: string }[] {
    return field.kind === 'select' || field.kind === 'multi'
      ? field.options
      : [];
  }

  /**
   * A list setting as text, for a control: what the draft has, or what is in
   * effect, where a pattern is a `RegExp` and a transform a function.
   */
  protected list(value: unknown): string[] {
    return (Array.isArray(value) ? value : []).map((item) =>
      item instanceof RegExp
        ? item.source
        : typeof item === 'function'
          ? item.name
          : String(item)
    );
  }

  protected levelsOf(value: unknown): Record<string, string> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {};
  }

  protected shortcutsOf(value: unknown): LabShortcut[] {
    return Array.isArray(value) ? (value as LabShortcut[]) : [];
  }

  /** A broker setting as the draft has it, or what the app monitor does without one. */
  protected brokerSetting(field: LabBrokerField): unknown {
    return this.brokerObject()?.[field.key] ?? field.default;
  }

  /** Writes a control's setting into the broker's config, which shows it. */
  protected setBroker(key: string, value: unknown): void {
    const config = this.brokerObject();
    if (config) {
      this.brokerConfig.set(JSON.stringify({ ...config, [key]: value }));
      this.brokerConfigError.set('');
    }
  }

  protected setBrokerNumber(key: string, value: unknown): void {
    const number = Number(value);
    if (value !== '' && Number.isFinite(number)) {
      this.setBroker(key, number);
    }
  }

  protected setBrokerLines(key: string, text: string): void {
    this.setBroker(
      key,
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }

  /** A text of lines into the list it stands for: blank lines are none. */
  protected setLines(section: string, key: string, text: string): void {
    this.set(
      section,
      key,
      text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    );
  }

  /** A setting as the draft has it, or as it is in effect. */
  protected setting(section: string, key: string): unknown {
    const fromDraft = (
      this.overlay()?.[section] as Record<string, unknown> | undefined
    )?.[key];
    return fromDraft ?? this.inEffect[section][key];
  }

  /** Writes a control's setting into the draft, which shows it. */
  protected set(section: string, key: string, value: unknown): void {
    const overlay = this.overlay();
    if (!overlay) {
      return;
    }
    const settings = overlay[section] as Record<string, unknown> | undefined;
    this.edit(
      JSON.stringify(
        { ...overlay, [section]: { ...settings, [key]: value } },
        null,
        2
      )
    );
  }

  protected setNumber(section: string, key: string, value: unknown): void {
    const number = Number(value);
    if (value !== '' && Number.isFinite(number)) {
      this.set(section, key, number);
    }
  }

  protected edit(draft: string): void {
    this.draft.set(draft);
    this.error.set('');
  }

  /** Back to the library's default, or a list to edit that starts there. */
  protected useDefault(useDefault: boolean): void {
    this.telemetries.set(useDefault ? null : DEFAULT_TELEMETRIES);
  }

  /**
   * Sets the broker, then reloads with the overlay — keeping the other
   * startup options, which in-app links drop. Nothing changes while either
   * is wrong.
   */
  protected async apply(): Promise<void> {
    const overlay = this.overlay();
    const problem = overlay
      ? labCheckConfig(overlay, this.known)
      : 'Not a JSON object.';
    const brokerConfig = parseJsonObject(this.brokerConfig().trim() || '{}');
    this.error.set(problem);
    this.brokerConfigError.set(brokerConfig ? '' : 'Not a JSON object.');
    if (problem || !overlay || !brokerConfig) {
      return;
    }
    await this.wire.setBrokerMode(this.mode());
    await this.wire.setTelemetries(this.telemetries());
    await this.wire.setBrokerConfig(brokerConfig);
    this.reload(overlay, {
      destination: this.destination(),
      channel: this.channel(),
      inspector: this.inspector(),
      telemetry: this.telemetry()
    });
  }

  /** The lab's own settings, and the broker's default answer. */
  protected async reset(): Promise<void> {
    await this.wire.setBrokerMode('ok');
    await this.wire.setTelemetries(null);
    await this.wire.setBrokerConfig({});
    this.reload({});
  }

  protected setDebug(flag: DebugFlag, on: boolean): void {
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

  /** Starts the lab again, with `config` and how it is to start: as now, by default. */
  private reload(
    config: Record<string, unknown>,
    start: Omit<LabOptions, 'config'> = this.options
  ): void {
    this.window.location.assign(
      `${this.window.location.pathname}${labSearch({ ...start, config })}`
    );
  }

  /** As the library reads them: a list of logger names is not "on". */
  private readDebug(): Record<DebugFlag, boolean> {
    return {
      debugScenario: uwtIsDebugEnabled('debugScenario'),
      debugBI: uwtIsDebugEnabled('debugBI'),
      debugLogger: uwtIsDebugEnabled('debugLogger')
    };
  }
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
