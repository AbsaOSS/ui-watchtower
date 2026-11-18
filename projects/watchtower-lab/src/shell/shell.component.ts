import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
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
import { CpsIconComponent, CpsTooltipDirective } from 'cps-ui-kit';
import { filter } from 'rxjs';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorService } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { LabLayout } from '../lab/lab-layout.service';
import { LabRumCredentialsProvider } from '../lab/lab-rum-credentials.provider';
import { LabReturnPage } from '../lab/lab-return-page';
import { LAB_USER_NAMES } from '../lab/lab-users';
import { labTelemetriesLabel, LabWire } from '../lab/lab-wire.service';
import {
  LAB_OPTIONS,
  SHELL_GROUPS,
  SHELL_PAGES,
  SHELL_SETTINGS
} from './shell.config';

/**
 * The broker's setting as this page load got it, and the next load's when
 * that differs: `ok → null after reload`.
 */
function inEffect(now?: string, next?: string): string {
  if (now === undefined) {
    return next ?? '…';
  }
  return next === undefined || next === now
    ? now
    : `${now} → ${next} after reload`;
}

/** The lab's frame: a fixed header, the pages, and a fixed status bar. */
@Component({
  selector: 'lab-root',
  imports: [
    CpsIconComponent,
    CpsTooltipDirective,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // On the document: Safari doesn't focus a button it clicks, so Escape
  // after opening the nav with the mouse wouldn't come from inside it.
  host: { '(document:keydown.escape)': 'closeNav()' },
  template: `
    <header class="lab-header">
      <a class="lab-home" routerLink="/" queryParamsHandling="preserve">
        <img
          class="lab-logo"
          src="assets/logo/logo-mark.svg"
          alt=""
          width="32"
          height="32" />
        <strong class="lab-title">Watchtower Lab</strong>
      </a>
      <!-- Inline when there's room; otherwise behind Run settings. -->
      <div class="lab-chips">
        <ng-container [ngTemplateOutlet]="chips" />
      </div>
      <details #runSettings class="lab-run-settings">
        <summary>Run settings</summary>
        <div class="lab-run-settings__panel">
          <ng-container [ngTemplateOutlet]="chips" />
        </div>
      </details>
      <span class="lab-spacer"></span>
      <span
        class="lab-user"
        [cpsTooltip]="userTitle()"
        tooltipOpenDelay="0"
        tooltipPosition="bottom"
        >{{ identity().userId ? 'Signed in' : 'Signed out' }}</span
      >
      <button
        type="button"
        class="lab-header-button"
        (click)="inspector.open()">
        Event Inspector
      </button>
      <button
        type="button"
        class="lab-header-icon"
        [class.lab-header-icon--active]="inSettings()"
        [attr.aria-label]="settings.label"
        [attr.aria-pressed]="inSettings()"
        [cpsTooltip]="inSettings() ? 'Close settings' : settings.label"
        tooltipOpenDelay="0"
        tooltipPosition="bottom"
        (click)="toggleSettings()">
        <cps-icon icon="settings" size="1.25rem" />
      </button>
    </header>

    <!-- Each chip leads to its setting; a custom config, to what differs. -->
    <ng-template #chips>
      <a
        class="lab-chip"
        routerLink="/settings/delivery"
        queryParamsHandling="preserve"
        >destination: {{ options.destination }}</a
      >
      <a
        class="lab-chip"
        routerLink="/settings/delivery"
        queryParamsHandling="preserve"
        >telemetry: {{ options.telemetry ? 'on' : 'off' }}</a
      >
      <a
        class="lab-chip"
        routerLink="/settings/rum-broker"
        queryParamsHandling="preserve"
        >broker: {{ broker() }}</a
      >
      <a
        class="lab-chip"
        routerLink="/settings/rum-broker"
        queryParamsHandling="preserve"
        >rum telemetries: {{ telemetries() }}</a
      >
      @if (options.channel === 'shared') {
        <a
          class="lab-chip"
          routerLink="/settings/delivery"
          queryParamsHandling="preserve"
          >channel: shared</a
        >
      }
      @if (customConfig) {
        <a
          class="lab-chip"
          routerLink="/settings"
          queryParamsHandling="preserve"
          >config: custom</a
        >
      }
    </ng-template>

    <div class="lab-layout">
      <div
        class="lab-layout__grid"
        [class.lab-layout__grid--whole]="inSettings()">
        @if (!inSettings()) {
          <nav class="lab-nav" aria-label="Lab pages">
            <button
              #navToggle
              type="button"
              class="lab-nav__toggle"
              aria-controls="lab-nav-pages"
              [attr.aria-expanded]="navOpen()"
              (click)="navOpen.set(!navOpen())">
              <span aria-hidden="true">☰</span> Pages
              <span class="lab-nav__current"
                ><span aria-hidden="true">·</span> {{ current() }}</span
              >
            </button>
            <div
              id="lab-nav-pages"
              class="lab-nav__pages"
              [class.lab-nav__pages--open]="navOpen()">
              @for (group of groups; track group.name) {
                <p class="lab-nav__group" [id]="'lab-nav-' + group.name">
                  {{ group.name }}
                </p>
                <ul [attr.aria-labelledby]="'lab-nav-' + group.name">
                  @for (page of group.pages; track page.path) {
                    <li>
                      <a
                        [routerLink]="page.path"
                        queryParamsHandling="preserve"
                        routerLinkActive="active"
                        ariaCurrentWhenActive="page"
                        >{{ page.label }}</a
                      >
                    </li>
                  }
                </ul>
              }
            </div>
          </nav>
        }
        <!-- Settings has a main of its own, padded as this one, beside its
           list of sections as this one is beside the nav. One outlet,
           either way, so moving into Settings doesn't build its page
           twice. -->
        <div
          [class.lab-main]="!inSettings()"
          [attr.role]="inSettings() ? null : 'main'">
          <router-outlet />
        </div>
      </div>
    </div>

    <footer class="lab-status">
      <span
        title="Everything the mock dataplane received. RUM's own events — page views, timings, its session start — arrive while the page is idle, too."
        >RUM events: {{ wire.rum().length }}</span
      >
      <span title="The library's own events among them"
        >from the library: {{ wire.libraryEvents() }}</span
      >
      <span>batches: {{ wire.batches() }}</span>
      <span>logs: {{ wire.logs().length }}</span>
      <span
        class="lab-status__id"
        [title]="'session: ' + (identity().sessionId ?? '—')"
        >session: {{ identity().sessionId ?? '—' }}</span
      >
      <span
        class="lab-status__id"
        [title]="'user: ' + (identity().userId ?? '—')"
        >user: {{ identity().userId ?? '—' }}</span
      >
    </footer>
  `
})
export class ShellComponent {
  protected readonly options = inject(LAB_OPTIONS);
  protected readonly customConfig = Object.keys(this.options.config).length > 0;
  protected readonly wire = inject(LabWire);
  protected readonly inspector = inject(UwtEventInspectorService);
  protected readonly identity = signal<{ sessionId?: string; userId?: string }>(
    {}
  );

  protected readonly groups = SHELL_GROUPS.map((name) => ({
    name,
    pages: SHELL_PAGES.filter((page) => page.group === name)
  }));

  /** Who is signed in: their name, when the lab knows it, and their id. */
  protected readonly userTitle = computed(() => {
    const id = this.identity().userId;
    if (!id) {
      return 'Nobody is signed in';
    }
    const name = LAB_USER_NAMES[id];
    return `Signed in as ${name ? `${name} (${id})` : id}`;
  });

  protected readonly settings = SHELL_SETTINGS;

  /** Whether the folded nav is open, on a narrow screen. */
  protected readonly navOpen = signal(false);
  /** Read from the address at first, so Settings never shows the nav. */
  private readonly path = signal(
    (inject(DOCUMENT).location?.pathname ?? '').replace(/^\//, '')
  );

  /** The lab page shown, if one is: none in Settings. */
  private readonly page = computed(() =>
    SHELL_PAGES.find((page) => page.path === this.path().split('/')[0])
  );

  protected readonly current = computed(() => this.page()?.label ?? '');

  /** Settings takes the whole page: its sections are its only nav. */
  protected readonly inSettings = computed(
    () => this.path().split('/')[0] === SHELL_SETTINGS.path
  );

  private readonly credentials = inject(LabRumCredentialsProvider);
  protected readonly broker = computed(() =>
    inEffect(
      this.credentials.startup()?.mode,
      this.wire.polled() ? this.wire.brokerMode() : undefined
    )
  );

  protected readonly telemetries = computed(() => {
    const startup = this.credentials.startup();
    return inEffect(
      startup && labTelemetriesLabel(startup.telemetries),
      this.wire.polled() ? this.wire.telemetriesLabel() : undefined
    );
  });

  private readonly sink = inject(UwtTelemetrySink);
  private readonly document = inject(DOCUMENT);
  // Not there in Settings.
  private readonly navToggle =
    viewChild<ElementRef<HTMLButtonElement>>('navToggle');

  private readonly runSettings =
    viewChild<ElementRef<HTMLDetailsElement>>('runSettings');

  private readonly router = inject(Router);
  private readonly returnPage = inject(LabReturnPage);

  constructor() {
    inject(LabLayout);
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.path.set(this.router.url.split(/[?#]/)[0].replace(/^\//, ''));
        this.navOpen.set(false);
        const page = this.page();
        if (page) {
          this.returnPage.set({ path: page.path, label: page.label });
        }
        // Its chips lead into Settings: it folds away once one is followed.
        this.runSettings()?.nativeElement.removeAttribute('open');
      });

    const destroyRef = inject(DestroyRef);
    // In the browser only, like the wire's polling.
    afterNextRender(() => {
      // Hydrated: the page now answers clicks. The suite waits for this.
      this.document.documentElement.setAttribute('data-lab-ready', '');
      const timer = setInterval(
        () =>
          this.identity.set({
            sessionId: this.sink.getSessionId(),
            userId: this.sink.getUserId()
          }),
        1000
      );
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  /** Focuses the page's content; handled here, so the router stays out. */
  /** Into Settings, or out of it, back to the page it was opened from. */
  protected async toggleSettings(): Promise<void> {
    const path = this.inSettings()
      ? this.returnPage.page().path
      : SHELL_SETTINGS.path;
    await this.router.navigate(['/', path], {
      queryParamsHandling: 'preserve'
    });
  }

  /** Escape folds the open nav, back to its button. */
  protected closeNav(): void {
    const toggle = this.navToggle()?.nativeElement;
    if (this.navOpen() && toggle) {
      // Focus goes back to the toggle, unless it is in a field elsewhere:
      // Escape there is that field's.
      const focused = toggle.ownerDocument.activeElement;
      const elsewhere =
        !!focused &&
        focused !== toggle.ownerDocument.body &&
        !focused.closest('.lab-nav');
      this.navOpen.set(false);
      if (!elsewhere) {
        toggle.focus();
      }
    }
  }
}
