import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
  signal
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UwtTelemetrySink } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtEventInspectorService } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';
import { LabLayout } from '../lab/lab-layout.service';
import { LabWire } from '../lab/lab-wire.service';
import { LAB_OPTIONS, SHELL_PAGES } from './shell.config';

/** The lab's frame: a fixed header, the pages, and a fixed status bar. */
@Component({
  selector: 'lab-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      <span class="lab-chip">destination: {{ options.destination }}</span>
      <span class="lab-chip"
        >telemetry: {{ options.telemetry ? 'on' : 'off' }}</span
      >
      <span class="lab-chip">broker: {{ wire.brokerMode() }}</span>
      <span class="lab-chip"
        >rum telemetries: {{ wire.telemetriesLabel() }}</span
      >
      @if (options.channel === 'shared') {
        <span class="lab-chip">channel: shared</span>
      }
      @if (customConfig) {
        <span class="lab-chip">config: custom</span>
      }
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

    <div class="lab-layout">
      <nav class="lab-nav" aria-label="Lab pages">
        @for (page of pages; track page.path) {
          <a [routerLink]="page.path" routerLinkActive="active">{{
            page.label
          }}</a>
        }
      </nav>
      <main class="lab-main" id="lab-main" tabindex="-1">
        <router-outlet />
      </main>
    </div>

    <footer class="lab-status">
      <span
        >Mock dataplane: {{ wire.rum().length }} RUM events ({{
          wire.libraryEvents()
        }}
        from the library) in {{ wire.batches() }} batches</span
      >
      <span>logs: {{ wire.logs().length }}</span>
      <span>session: {{ identity().sessionId ?? '—' }}</span>
      <span>user: {{ identity().userId ?? '—' }}</span>
    </footer>
  `,
  styles: `
    .lab-logo {
      flex-shrink: 0;
      margin-right: -0.25rem;
      border-radius: 50%;
      box-shadow: 0 0 0 0.125rem #ffffffb3;
    }
    .lab-title {
      font-size: 1.2rem;
    }
    .lab-chip {
      padding: 0.15rem 0.6rem;
      border-radius: 1rem;
      background-color: #ffffff26;
      font-size: 0.85rem;
      white-space: nowrap;
    }
    .lab-spacer {
      flex: 1;
    }
    .lab-user {
      white-space: nowrap;
    }
    .lab-header-button {
      padding: 0.35rem 0.9rem;
      border: 0.0625rem solid #fff;
      border-radius: 0.25rem;
      background: transparent;
      color: #fff;
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
  `
})
export class ShellComponent {
  protected readonly options = inject(LAB_OPTIONS);
  protected readonly customConfig = Object.keys(this.options.config).length > 0;
  protected readonly wire = inject(LabWire);
  protected readonly inspector = inject(UwtEventInspectorService);
  protected readonly pages = SHELL_PAGES;
  protected readonly identity = signal<{ sessionId?: string; userId?: string }>(
    {}
  );

  private readonly sink = inject(UwtTelemetrySink);
  private readonly document = inject(DOCUMENT);

  constructor() {
    inject(LabLayout);
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
}
