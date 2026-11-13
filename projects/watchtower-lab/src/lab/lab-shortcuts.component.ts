import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal
} from '@angular/core';
import {
  CpsButtonComponent,
  CpsInputComponent,
  CpsSwitchComponent
} from 'cps-ui-kit';

/** A shortcut as `inspector.shortcuts` has it. */
export interface LabShortcut {
  code: string;
  after?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

const MODIFIERS = ['ctrl', 'alt', 'shift', 'meta'] as const;

/** A shortcut as people read it: `Shift+E+I`, `F9`, `Ctrl+Alt+D`. */
export function labDescribeShortcut(shortcut: LabShortcut): string {
  const key = (code: string | undefined) => code?.replace(/^Digit|^Key/, '');
  return [
    shortcut.ctrl && 'Ctrl',
    shortcut.alt && 'Alt',
    shortcut.shift && 'Shift',
    shortcut.meta && 'Meta',
    key(shortcut.after),
    key(shortcut.code)
  ]
    .filter(Boolean)
    .join('+');
}

/**
 * The keys that open the Event Inspector: the ones set, each with a way to
 * remove it, and a way to add one. None at all is no shortcut.
 */
@Component({
  selector: 'lab-shortcuts',
  imports: [CpsButtonComponent, CpsInputComponent, CpsSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lab-rows" role="group" aria-label="Shortcuts">
      @for (shortcut of shortcuts(); track $index) {
        <div class="lab-row">
          <span class="lab-row__name">{{ describe(shortcut) }}</span>
          <cps-button
            type="outlined"
            size="small"
            icon="delete"
            label="Remove"
            [ariaLabel]="'Remove shortcut ' + describe(shortcut)"
            [disabled]="disabled()"
            (clicked)="remove($index)" />
        </div>
      } @empty {
        <p class="lab-row__none">
          No shortcut: the inspector opens from the page.
        </p>
      }
      <div class="lab-row">
        <cps-input
          label="Key (KeyboardEvent.code)"
          hint="For example F9, KeyD or Digit8."
          width="16rem"
          [value]="code()"
          [disabled]="disabled()"
          (valueChanged)="code.set($event)" />
        <cps-input
          label="Pressed just before (optional)"
          hint="Held with the modifiers: KeyE for Shift+E+I."
          width="16rem"
          [value]="after()"
          [disabled]="disabled()"
          (valueChanged)="after.set($event)" />
      </div>
      <div class="lab-row">
        @for (modifier of modifiers; track modifier) {
          <cps-switch
            [label]="modifier.label"
            [value]="held()[modifier.key]"
            [disabled]="disabled()"
            (valueChanged)="hold(modifier.key, $event)" />
        }
        <cps-button
          label="Add shortcut"
          type="outlined"
          size="small"
          [disabled]="disabled() || !code().trim()"
          (clicked)="add()" />
      </div>
    </div>
  `
})
export class LabShortcutsComponent {
  readonly shortcuts = input.required<LabShortcut[]>();
  readonly disabled = input(false);
  /** The shortcuts as the reader has changed them. */
  readonly changed = output<LabShortcut[]>();

  protected readonly describe = labDescribeShortcut;
  protected readonly modifiers = MODIFIERS.map((key) => ({
    key,
    label: key === 'meta' ? 'Meta (⌘)' : key[0].toUpperCase() + key.slice(1)
  }));

  protected readonly code = signal('');
  protected readonly after = signal('');
  protected readonly held = signal<Record<(typeof MODIFIERS)[number], boolean>>(
    {
      ctrl: false,
      alt: false,
      shift: false,
      meta: false
    }
  );

  protected hold(key: (typeof MODIFIERS)[number], on: boolean): void {
    this.held.update((held) => ({ ...held, [key]: on }));
  }

  protected remove(index: number): void {
    this.changed.emit(this.shortcuts().filter((_, i) => i !== index));
  }

  protected add(): void {
    const code = this.code().trim();
    if (!code) {
      return;
    }
    const after = this.after().trim();
    const held = this.held();
    this.changed.emit([
      ...this.shortcuts(),
      {
        code,
        ...(after && { after }),
        ...Object.fromEntries(
          MODIFIERS.filter((key) => held[key]).map((key) => [key, true])
        )
      }
    ]);
    this.code.set('');
    this.after.set('');
    this.held.set({ ctrl: false, alt: false, shift: false, meta: false });
  }
}
