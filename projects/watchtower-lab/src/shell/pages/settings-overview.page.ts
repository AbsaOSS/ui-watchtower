import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CpsButtonComponent } from 'cps-ui-kit';
import { LabSettingsDraft } from '../../lab/lab-settings-draft.service';

/** Settings' first page: what is waiting to be applied, and a way back to the lab's own. */
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
            @for (change of draft.changes(); track $index) {
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
              </li>
            }
          </ul>
        } @else {
          <p>Nothing: every section is as applied.</p>
        }
      </div>

      <div class="lab-card">
        <h2>The lab's settings</h2>
        <p>
          Back to the library's settings and the mock broker's answer as the lab
          sets them. How the lab starts, and the debug flags, stay as they are.
        </p>
        <div class="lab-actions">
          <cps-button
            label="Back to the lab's settings"
            type="outlined"
            (clicked)="draft.reset()" />
        </div>
      </div>
    </section>
  `
})
export class SettingsOverviewPage {
  protected readonly draft = inject(LabSettingsDraft);
}
