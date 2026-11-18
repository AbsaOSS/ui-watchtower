import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CpsInputComponent,
  CpsSelectComponent,
  CpsSwitchComponent,
  CpsTextareaComponent
} from 'cps-ui-kit';
import { LabLoggerLevelsComponent } from '../../lab/lab-logger-levels.component';
import { LabSettingStateComponent } from '../../lab/lab-setting-state.component';
import {
  LabSettingsDraft,
  labSettingId
} from '../../lab/lab-settings-draft.service';
import {
  LAB_SETTINGS_APPLIES,
  LabField,
  labFieldLabel,
  labInOverlay,
  LabSettingsSection
} from '../../lab/lab-settings-fields';
import {
  LabShortcut,
  LabShortcutsComponent
} from '../../lab/lab-shortcuts.component';
import { LAB_TELEMETRIES } from '../../lab/lab-wire.service';

/**
 * One section of Settings: its controls, which write into the shared draft,
 * each with what it does and where it stands — not applied yet, or other
 * than the lab's default. The setting a search led to, named in the
 * address's fragment, is shown and focused.
 */
@Component({
  selector: 'lab-settings-section',
  imports: [
    CpsInputComponent,
    CpsSelectComponent,
    CpsSwitchComponent,
    CpsTextareaComponent,
    LabLoggerLevelsComponent,
    LabSettingStateComponent,
    LabShortcutsComponent,
    RouterLink
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <div class="lab-settings__title">
        <h1>{{ section.label }}</h1>
        @if (applies) {
          <span class="lab-settings__applies">{{ applies }}</span>
        }
      </div>
      <p>{{ section.lead }}</p>

      @if (writesOverlay && !draft.overlay()) {
        <p class="lab-settings__notice">
          These controls are off while the JSON in
          <a routerLink="/settings/json" queryParamsHandling="preserve"
            >Configuration as JSON</a
          >
          isn't an object.
        </p>
      }

      @if (section.fields.length) {
        <div class="lab-card">
          <div class="lab-fields">
            @for (field of section.fields; track id(field)) {
              <div
                class="lab-field"
                [id]="'setting-' + id(field)"
                [class.lab-field-wide]="
                  field.kind === 'levels' || field.kind === 'shortcuts'
                "
                [class.lab-field--found]="found() === id(field)">
                @switch (field.kind) {
                  @case ('switch') {
                    <cps-switch
                      [label]="label(field)"
                      [value]="!!draft.value(field)"
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.set(field, $event)" />
                    <p class="lab-field__help">{{ field.help }}</p>
                  }
                  @case ('number') {
                    <cps-input
                      type="number"
                      [label]="label(field)"
                      [hint]="field.help"
                      width="26rem"
                      [value]="'' + draft.value(field)"
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.setNumber(field, $event)" />
                  }
                  @case ('text') {
                    <cps-input
                      [label]="label(field)"
                      [hint]="field.help"
                      width="26rem"
                      [value]="'' + (draft.value(field) ?? '')"
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.set(field, $event)" />
                  }
                  @case ('select') {
                    <cps-select
                      [label]="label(field)"
                      [hint]="field.help"
                      [options]="selectOptions(field)"
                      [returnObject]="false"
                      [value]="'' + draft.value(field)"
                      width="26rem"
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.set(field, $event)" />
                  }
                  @case ('multi') {
                    <cps-select
                      [label]="label(field)"
                      [hint]="field.help"
                      [options]="selectOptions(field)"
                      [returnObject]="false"
                      [multiple]="true"
                      [chips]="true"
                      [value]="list(draft.value(field))"
                      width="26rem"
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.set(field, $event)" />
                  }
                  @case ('lines') {
                    <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
                    <cps-textarea
                      ngSkipHydration
                      [label]="label(field)"
                      [hint]="field.help"
                      [rows]="3"
                      width="26rem"
                      [value]="
                        list(draft.value(field)).join(
                          '
'
                        )
                      "
                      [disabled]="draft.disabled(field)"
                      (valueChanged)="draft.setLines(field, $event)" />
                  }
                  @case ('levels') {
                    <p class="lab-field-wide__label">{{ label(field) }}</p>
                    <p class="lab-field__help">{{ field.help }}</p>
                    <lab-logger-levels
                      [levels]="levelsOf(draft.value(field))"
                      [disabled]="draft.disabled(field)"
                      (changed)="draft.set(field, $event)" />
                  }
                  @case ('shortcuts') {
                    <p class="lab-field-wide__label">{{ label(field) }}</p>
                    <p class="lab-field__help">{{ field.help }}</p>
                    <lab-shortcuts
                      [shortcuts]="shortcutsOf(draft.value(field))"
                      [disabled]="draft.disabled(field)"
                      (changed)="draft.set(field, $event)" />
                  }
                  @case ('telemetries') {
                    <cps-switch
                      label="The library's default"
                      [value]="draft.telemetries() === null"
                      (valueChanged)="draft.useDefaultTelemetries($event)" />
                    <p class="lab-field__help">{{ field.help }}</p>
                    @if (draft.telemetries(); as chosen) {
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
                        (valueChanged)="draft.set(field, $event)" />
                    }
                  }
                }
                <lab-setting-state
                  [change]="draft.changeById().get(id(field))"
                  [modified]="draft.modifiedById().get(id(field))" />
              </div>
            }
          </div>
          @if (section.path === 'app-monitor') {
            <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
            <cps-textarea
              ngSkipHydration
              label="Laid over the app monitor config (JSON)"
              width="26rem"
              [rows]="3"
              [value]="draft.brokerText()"
              [error]="draft.brokerError()"
              (valueChanged)="draft.editBroker($event)" />
          }
        </div>
      }

      @switch (section.path) {
        @case ('json') {
          <div class="lab-card">
            <!-- cps-textarea can't be hydrated: it's rendered afresh. -->
            <cps-textarea
              ngSkipHydration
              label="Settings (JSON)"
              hint="Patterns are RegExp sources; the one value transform is mask-order-ids."
              [rows]="12"
              [value]="draft.overlayText()"
              [error]="draft.overlayError()"
              (valueChanged)="draft.editOverlay($event)" />
          </div>
        }
        @case ('effective') {
          <div class="lab-card">
            <pre
              class="lab-readout"
              tabindex="0"
              role="region"
              aria-label="Settings in effect"
              >{{ draft.effective }}</pre>
          </div>
        }
      }
    </section>
  `
})
export class SettingsSectionPage {
  protected readonly draft = inject(LabSettingsDraft);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly section: LabSettingsSection =
    this.route.snapshot.data.section;

  protected readonly applies =
    this.section.applies && LAB_SETTINGS_APPLIES[this.section.applies];

  /** Whether its controls write into the overlay, and so wait for its JSON. */
  protected readonly writesOverlay = this.section.fields.some(labInOverlay);

  /** The setting a search led to, by its id. */
  protected readonly found = signal<string | null>(null);

  protected readonly id = labSettingId;
  protected readonly label = labFieldLabel;
  protected readonly telemetryOptions = LAB_TELEMETRIES.map((t) => ({
    label: t,
    value: t
  }));

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe((id) => {
      this.found.set(id);
      if (id) {
        afterNextRender(() => this.reveal(id), { injector: this.injector });
      }
    });
  }

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

  /** Brings a setting into view, and its control into focus. */
  private reveal(id: string): void {
    const field = this.host.nativeElement.ownerDocument.getElementById(
      `setting-${id}`
    );
    field?.scrollIntoView({ block: 'center' });
    field
      ?.querySelector<HTMLElement>('input, textarea, [role="combobox"], button')
      ?.focus({ preventScroll: true });
  }
}
