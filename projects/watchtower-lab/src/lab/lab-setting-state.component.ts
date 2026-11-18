import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabSettingsEntry } from './lab-settings-draft.service';

/**
 * Under a setting's control, where it stands: changed and not applied yet,
 * with Undo; or otherwise than the lab's default, with the default and a
 * Reset. Nothing while it is as applied, and as by default.
 */
@Component({
  selector: 'lab-setting-state',
  imports: [CpsButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'lab-setting-state' },
  template: `
    @if (change(); as change) {
      <span class="lab-setting-state__tag lab-setting-state__tag--pending"
        >Not applied</span
      >
      <cps-button
        type="borderless"
        size="xsmall"
        label="Undo"
        [ariaLabel]="'Undo ' + change.label"
        (clicked)="change.revert()" />
    } @else if (modified(); as modified) {
      <span class="lab-setting-state__tag">Modified</span>
      <span class="lab-setting-state__default"
        >Lab default: {{ modified.from }}</span
      >
      <cps-button
        type="borderless"
        size="xsmall"
        label="Reset"
        [ariaLabel]="'Reset ' + modified.label + ' to the lab default'"
        (clicked)="modified.revert()" />
    }
  `
})
export class LabSettingStateComponent {
  /** The setting's change not applied yet, if it has one. */
  readonly change = input<LabSettingsEntry>();
  /** How it differs from the lab's default, if it does. */
  readonly modified = input<LabSettingsEntry>();
}
