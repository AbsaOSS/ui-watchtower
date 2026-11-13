import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import { CpsButtonComponent, CpsSelectComponent } from 'cps-ui-kit';
import { filter } from 'rxjs';
import { LabSettingsDraft } from '../../lab/lab-settings-draft.service';
import {
  LAB_SETTINGS_AREAS,
  LAB_SETTINGS_SECTIONS
} from '../../lab/lab-settings-fields';

/** The picker's value for the overview, which has no path of its own. */
const OVERVIEW = 'overview';

/** The section an address is in: `logging` for `/settings/logging?…`. */
function sectionOf(url: string): string {
  return url.split(/[?#]/)[0].split('/')[2] || OVERVIEW;
}

/**
 * Settings: a list of its sections beside the one shown — a picker, when
 * there's no room for the list — and, while there are any, the changes not
 * applied yet, from every section, in a bar that applies them together.
 */
@Component({
  selector: 'lab-settings-page',
  imports: [
    CpsButtonComponent,
    CpsSelectComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet
  ],
  providers: [LabSettingsDraft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lab-settings">
      <nav class="lab-settings__nav" aria-label="Settings sections">
        <ul>
          <li>
            <a
              routerLink="/settings"
              queryParamsHandling="preserve"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: true }"
              ariaCurrentWhenActive="page"
              >Overview</a
            >
          </li>
        </ul>
        @for (area of areas; track area.name) {
          <p class="lab-settings__area" [id]="area.id">{{ area.name }}</p>
          <ul [attr.aria-labelledby]="area.id">
            @for (section of area.sections; track section.path) {
              <li>
                <a
                  [routerLink]="['/settings', section.path]"
                  queryParamsHandling="preserve"
                  routerLinkActive="active"
                  ariaCurrentWhenActive="page"
                  >{{ section.label }}
                  @if (notes().get(section.path); as note) {
                    <span class="cps-sr-only">({{ note }})</span>
                    <span class="lab-settings__marks" aria-hidden="true">
                      @if (counts().get(section.path); as count) {
                        <span class="lab-settings__count">{{ count }}</span>
                      }
                      @if (changed().has(section.path)) {
                        <span class="lab-settings__dot"></span>
                      }
                    </span>
                  }
                </a>
              </li>
            }
          </ul>
        }
      </nav>

      <div class="lab-settings__picker">
        <cps-select
          label="Section"
          [options]="picks"
          [returnObject]="false"
          [value]="current()"
          [hideDetails]="true"
          width="26rem"
          (valueChanged)="go($event)" />
      </div>

      <div class="lab-settings__content">
        <router-outlet />

        @if (draft.changes(); as changes) {
          @if (changes.length) {
            <div
              class="lab-pending"
              role="region"
              aria-label="Changes not applied">
              <p class="lab-pending__summary">
                <span class="lab-settings__dot" aria-hidden="true"></span>
                <strong
                  >{{ changes.length }}
                  {{ changes.length === 1 ? 'change' : 'changes' }} not
                  applied</strong
                >
                <span class="lab-pending__list">{{ listed() }}</span>
              </p>
              <div class="lab-actions">
                @if (current() !== overview) {
                  <a
                    class="lab-pending__review"
                    routerLink="/settings"
                    queryParamsHandling="preserve"
                    >Review</a
                  >
                }
                <cps-button
                  label="Discard"
                  type="outlined"
                  (clicked)="draft.discard()" />
                <cps-button
                  label="Apply and reload"
                  (clicked)="draft.apply()" />
              </div>
              @for (problem of draft.problems(); track problem.section.path) {
                <p class="lab-pending__problem" role="alert">
                  <a
                    [routerLink]="['/settings', problem.section.path]"
                    queryParamsHandling="preserve"
                    >{{ problem.section.label }}</a
                  >: {{ problem.message }}
                </p>
              }
            </div>
          }
        }
      </div>
    </div>
  `
})
export class SettingsPage {
  protected readonly draft = inject(LabSettingsDraft);
  private readonly router = inject(Router);

  protected readonly overview = OVERVIEW;
  protected readonly areas = LAB_SETTINGS_AREAS.map((name) => ({
    name,
    id: `lab-settings-${name.toLowerCase().replace(/\W+/g, '-')}`,
    sections: LAB_SETTINGS_SECTIONS.filter((section) => section.area === name)
  }));

  protected readonly picks = [
    { label: 'Overview', value: OVERVIEW },
    ...LAB_SETTINGS_SECTIONS.map((section) => ({
      label: `${section.area} › ${section.label}`,
      value: section.path
    }))
  ];

  protected readonly current = signal(sectionOf(this.router.url));
  /** The sections with changes not applied. */
  protected readonly changed = computed(
    () => new Set(this.draft.changes().map((change) => change.section.path))
  );

  /** How many settings each section has other than the lab's defaults. */
  protected readonly counts = computed(() => {
    const counts = new Map<string, number>();
    for (const { section } of this.draft.modified()) {
      counts.set(section.path, (counts.get(section.path) ?? 0) + 1);
    }
    return counts;
  });

  /** Each section's marks, as read out: `2 modified, changes not applied`. */
  protected readonly notes = computed(
    () =>
      new Map(
        LAB_SETTINGS_SECTIONS.map((section) => {
          const count = this.counts().get(section.path);
          const notes = [
            count && `${count} modified`,
            this.changed().has(section.path) && 'changes not applied'
          ].filter(Boolean);
          return [section.path, notes.join(', ')];
        })
      )
  );

  protected readonly listed = computed(() =>
    this.draft
      .changes()
      .map((change) => `${change.section.label} › ${change.label}`)
      .join(', ')
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.current.set(sectionOf(this.router.url)));
  }

  protected async go(section: string): Promise<void> {
    await this.router.navigate(
      ['/settings', ...(section === OVERVIEW ? [] : [section])],
      { queryParamsHandling: 'preserve' }
    );
  }
}
