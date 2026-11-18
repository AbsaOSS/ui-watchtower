import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal
} from '@angular/core';
import {
  CpsButtonComponent,
  CpsInputComponent,
  CpsSelectComponent
} from 'cps-ui-kit';
import { LAB_LOG_LEVELS } from './lab-settings-fields';

/**
 * The level each named logger logs at, as `logging.levels` has it: the ones
 * set, each with its level and a way to remove it, and a way to add one.
 */
@Component({
  selector: 'lab-logger-levels',
  imports: [CpsButtonComponent, CpsInputComponent, CpsSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lab-rows" role="group" aria-label="Logger levels">
      @for (entry of entries(); track entry.name) {
        <div class="lab-row lab-row--labelled">
          <span class="lab-row__name">{{ entry.name }}</span>
          <cps-select
            [label]="'Level of ' + entry.name"
            [options]="options"
            [returnObject]="false"
            [value]="entry.level"
            [disabled]="disabled()"
            width="16rem"
            (valueChanged)="setLevel(entry.name, $event)" />
          <cps-button
            type="outlined"
            size="small"
            icon="delete"
            label="Remove"
            [ariaLabel]="'Remove logger ' + entry.name"
            [disabled]="disabled()"
            (clicked)="remove(entry.name)" />
        </div>
      } @empty {
        <p class="lab-row__none">No logger has a level of its own.</p>
      }
      <div class="lab-row lab-row--labelled">
        <cps-input
          label="Logger name"
          width="14rem"
          [value]="name()"
          [disabled]="disabled()"
          (valueChanged)="name.set($event)" />
        <cps-select
          label="Level for a new logger"
          [options]="options"
          [returnObject]="false"
          [value]="level()"
          [disabled]="disabled()"
          width="16rem"
          (valueChanged)="level.set($event)" />
        <cps-button
          label="Add logger"
          type="outlined"
          size="small"
          [disabled]="disabled() || !name().trim()"
          (clicked)="add()" />
      </div>
    </div>
  `
})
export class LabLoggerLevelsComponent {
  /** The levels as they are, by logger name. */
  readonly levels = input.required<Record<string, string>>();
  readonly disabled = input(false);
  /** The levels as the reader has changed them. */
  readonly changed = output<Record<string, string>>();

  protected readonly options = LAB_LOG_LEVELS;
  protected readonly name = signal('');
  protected readonly level = signal('warn');
  protected readonly entries = computed(() =>
    Object.entries(this.levels()).map(([name, level]) => ({ name, level }))
  );

  protected setLevel(name: string, level: string): void {
    this.changed.emit({ ...this.levels(), [name]: level });
  }

  protected remove(name: string): void {
    const { [name]: _removed, ...rest } = this.levels();
    this.changed.emit(rest);
  }

  protected add(): void {
    const name = this.name().trim();
    if (name) {
      this.changed.emit({ ...this.levels(), [name]: this.level() });
      this.name.set('');
    }
  }
}
