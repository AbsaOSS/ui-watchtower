import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';
import {
  CpsAutocompleteComponent,
  CpsButtonComponent,
  CpsSelectComponent
} from 'cps-ui-kit';
import { filter } from 'rxjs';
import {
  LabSettingsDraft,
  labSettingId
} from '../../lab/lab-settings-draft.service';
import {
  LAB_SETTINGS_AREAS,
  LAB_SETTINGS_SECTIONS,
  labSettingName
} from '../../lab/lab-settings-fields';

/** The picker's value for the overview, which has no path of its own. */
const OVERVIEW = 'overview';

/** A section, or a setting in one, as the search finds it. */
interface LabSearchResult {
  label: string;
  /** Where it is, under its label. */
  info: string;
  /** What else it is found by: its name in the JSON, section and help. */
  alias: string;
  path: string;
  /** The setting's id, to show it; none for a section. */
  id?: string;
}

/** Each section, then its settings, as the search lists them. */
const SEARCHABLE: LabSearchResult[] = LAB_SETTINGS_SECTIONS.flatMap(
  (section) => [
    {
      label: section.label,
      info: `Section · ${section.area}`,
      alias: `${section.area} ${section.lead}`,
      path: section.path
    },
    ...section.fields.map((field) => {
      const name = labSettingName(field);
      return {
        label: field.label,
        info: name ? `${section.label} · ${name}` : section.label,
        alias: `${name} ${section.label} ${field.help}`,
        path: section.path,
        id: labSettingId(field)
      };
    })
  ]
);

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
    CpsAutocompleteComponent,
    CpsButtonComponent,
    CpsSelectComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet
  ],
  providers: [LabSettingsDraft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'focusSearch($event)' },
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
        <!-- Over the section, wide enough for its results: the kit sizes
             them to the box. -->
        <cps-autocomplete
          class="lab-settings__search"
          ariaLabel="Find a setting"
          placeholder="Find a setting  /"
          prefixIcon="search"
          [options]="searchable"
          [returnObject]="true"
          optionLabel="label"
          optionInfo="info"
          [withOptionsAliases]="true"
          optionAlias="alias"
          [showChevron]="false"
          [hideDetails]="true"
          emptyMessage="No setting matches"
          width="100%"
          (valueChanged)="find($event)" />

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly search = viewChild.required(CpsAutocompleteComponent);

  protected readonly overview = OVERVIEW;
  protected readonly searchable = SEARCHABLE;
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

  /** Goes to what the search found: its section, and the setting, shown there. */
  protected async find(result: LabSearchResult | undefined): Promise<void> {
    if (!result) {
      return;
    }
    // Empty again for the next search, which may find the same one.
    this.search().writeValue(undefined);
    await this.router.navigate(['/settings', result.path], {
      fragment: result.id,
      queryParamsHandling: 'preserve'
    });
  }

  /** `/`, outside a field: to the search, as on many sites. */
  protected focusSearch(event: KeyboardEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.key !== '/' ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      target?.closest('input, textarea, select, [contenteditable]')
    ) {
      return;
    }
    event.preventDefault();
    this.host.nativeElement
      .querySelector<HTMLInputElement>('.lab-settings__search input')
      ?.focus();
  }
}
