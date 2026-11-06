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
import { filter } from 'rxjs';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorService } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { LabLayout } from '../lab/lab-layout.service';
import { LabRumCredentialsProvider } from '../lab/lab-rum-credentials.provider';
import { labTelemetriesLabel, LabWire } from '../lab/lab-wire.service';
import { LAB_OPTIONS, SHELL_GROUPS, SHELL_PAGES } from './shell.config';

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
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // On the document: Safari doesn't focus a button it clicks, so Escape
  // after opening the nav with the mouse wouldn't come from inside it.
  host: { '(document:keydown.escape)': 'closeNav()' },
  template: `
    <a class="lab-skip-link" href="#lab-main" (click)="skipToContent($event)"
      >Skip to content</a
    >
    <header class="lab-header">
      <img
        class="lab-logo"
        src="assets/logo/logo-mark.svg"
        alt=""
        width="32"
        height="32" />
      <strong class="lab-title">Watchtower Lab</strong>
      <!-- Inline when there's room; otherwise behind Run settings. -->
      <div class="lab-chips">
        <ng-container [ngTemplateOutlet]="chips" />
      </div>
      <details class="lab-run-settings">
        <summary>Run settings</summary>
        <div class="lab-run-settings__panel">
          <ng-container [ngTemplateOutlet]="chips" />
        </div>
      </details>
      <span class="lab-spacer"></span>
      <span class="lab-user">{{
        identity().userId ? 'Signed in' : 'Signed out'
      }}</span>
      <button
        type="button"
        class="lab-header-button"
        (click)="inspector.open()">
        Event Inspector
      </button>
    </header>

    <ng-template #chips>
      <span class="lab-chip">destination: {{ options.destination }}</span>
      <span class="lab-chip"
        >telemetry: {{ options.telemetry ? 'on' : 'off' }}</span
      >
      <span class="lab-chip">broker: {{ broker() }}</span>
      <span class="lab-chip">rum telemetries: {{ telemetries() }}</span>
      @if (options.channel === 'shared') {
        <span class="lab-chip">channel: shared</span>
      }
      @if (customConfig) {
        <span class="lab-chip">config: custom</span>
      }
    </ng-template>

    <div class="lab-layout">
      <div class="lab-layout__grid">
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
        <main class="lab-main" id="lab-main" tabindex="-1">
          <router-outlet />
        </main>
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

  /** Whether the folded nav is open, on a narrow screen. */
  protected readonly navOpen = signal(false);
  private readonly path = signal('');
  protected readonly current = computed(
    () => SHELL_PAGES.find((page) => page.path === this.path())?.label ?? ''
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
  private readonly navToggle =
    viewChild.required<ElementRef<HTMLButtonElement>>('navToggle');

  constructor() {
    inject(LabLayout);
    const router = inject(Router);
    router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.path.set(router.url.split(/[?#]/)[0].replace(/^\//, ''));
        this.navOpen.set(false);
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
  protected skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('lab-main')?.focus();
  }

  /** Escape folds the open nav, back to its button. */
  protected closeNav(): void {
    if (this.navOpen()) {
      this.navOpen.set(false);
      this.navToggle().nativeElement.focus();
    }
  }
}
