import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabSettingsDraft } from '../../lab/lab-settings-draft.service';

/**
 * Settings' first page: what is waiting to be applied, and what this load
 * runs with otherwise than the lab's defaults — each to undo or reset, or
 * every one reset at once.
 */
@Component({
  selector: 'lab-settings-overview',
  imports: [CpsButtonComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="lab-page">
      <h1>Settings</h1>
      <p>
        What the next load runs with, by section: how the lab starts, the
        library's settings and the mock backend's answers. Changes wait until
        they are applied, all together, with a reload; the debug flags apply at
        once.
      </p>

      <div class="lab-card">
        <h2>Not applied yet</h2>
        @if (draft.changes().length) {
          <ul class="lab-changes">
            @for (change of draft.changes(); track change.id) {
              <li>
                <a
                  [routerLink]="['/settings', change.section.path]"
                  queryParamsHandling="preserve"
                  >{{ change.section.label }} › {{ change.label }}</a
                >
                @if (change.from || change.to) {
                  <span class="lab-changes__values"
                    >{{ change.from }} → {{ change.to }}</span
                  >
                }
                <cps-button
                  type="borderless"
                  size="xsmall"
                  label="Undo"
                  [ariaLabel]="'Undo ' + change.label"
                  (clicked)="change.revert()" />
              </li>
            }
          </ul>
        } @else {
          <p>Nothing: every section is as applied.</p>
        }
      </div>

      <div class="lab-card">
        <h2>Different from the lab's defaults</h2>
        @if (draft.modified().length) {
          <p>
            Reset puts one back, Reset all every one, to apply with the rest; a
            debug flag goes back at once.
          </p>
          <ul class="lab-changes">
            @for (setting of draft.modified(); track setting.id) {
              <li>
                <a
                  [routerLink]="['/settings', setting.section.path]"
                  queryParamsHandling="preserve"
                  >{{ setting.section.label }} › {{ setting.label }}</a
                >
                <span class="lab-changes__values"
                  >{{ setting.from }} → {{ setting.to }}</span
                >
                <cps-button
                  type="borderless"
                  size="xsmall"
                  label="Reset"
                  [ariaLabel]="'Reset ' + setting.label + ' to the lab default'"
                  (clicked)="setting.revert()" />
              </li>
            }
          </ul>
          <div class="lab-actions">
            <cps-button
              label="Reset all to the lab's defaults"
              type="outlined"
              (clicked)="draft.resetAll()" />
          </div>
        } @else {
          <p>Nothing: this load runs as the lab does by default.</p>
        }
      </div>
    </section>
  `
})
export class SettingsOverviewPage {
  protected readonly draft = inject(LabSettingsDraft);
}
