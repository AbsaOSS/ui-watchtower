import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  createComponent,
  DestroyRef,
  EnvironmentInjector,
  inject,
  Injectable,
  NgZone,
  PLATFORM_ID,
  signal
} from '@angular/core';
import { UWT_TELEMETRY_IDENTITY } from '@absaoss-cps/ngx-ui-watchtower';
import { CpsDialogRef, CpsDialogService } from 'cps-ui-kit';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig,
  UwtInspectorDock,
  UwtInspectorPaneSide
} from '../uwt-inspector.models/uwt-inspector.models';
import { UWT_DEFAULT_INSPECTOR_CONFIG } from '../uwt-inspector-store/uwt-inspector-store';
import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  uwtMatchesShortcut
} from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import { UwtInspectorComponent } from '../uwt-inspector/uwt-inspector.component';
import { UwtInspectorPaneComponent } from '../uwt-inspector-pane/uwt-inspector-pane.component';
import { uwtOpenInspectorWindow } from '../uwt-inspector-window/uwt-inspector-window';
import {
  UwtInspectorHost,
  UwtInspectorSession
} from '../uwt-inspector-session/uwt-inspector-session';
import { UwtInspectorPreferenceStorage } from '../uwt-inspector-preferences/uwt-inspector-preferences';
import { UwtInspectorRing } from '../uwt-inspector-ring/uwt-inspector-ring';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/** Narrower than 640 CSS pixels, the app's window takes no pane. */
const NARROW = '(width < 640px)';

/**
 * Opens and closes the Event Inspector, moves it between docks, and
 * listens for its keyboard shortcut once {@link provideUwtEventInspector}
 * installs it.
 *
 * It opens where it was last — a dialog the first time, and on a screen
 * too narrow for a pane — and the application stays usable while events
 * arrive. With it open, the shortcut returns focus to it from the
 * application, and closes it when focus is already inside.
 *
 * @example
 * ```typescript
 * // From an app's own "Support" menu, when the shortcut is disabled:
 * inject(UwtEventInspectorService).open();
 * ```
 *
 * @group Services
 */
@Injectable({ providedIn: 'root' })
export class UwtEventInspectorService {
  private readonly dialogs = inject(CpsDialogService);
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly appRef = inject(ApplicationRef);
  private readonly environment = inject(EnvironmentInjector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(UwtInspectorSession);
  private readonly preferences = inject(UwtInspectorPreferenceStorage);
  private readonly ring = inject(UwtInspectorRing);
  private readonly identity = inject(UWT_TELEMETRY_IDENTITY, {
    optional: true
  });

  private readonly config: UwtEventInspectorConfig = {
    ...UWT_DEFAULT_INSPECTOR_CONFIG,
    shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS,
    ...inject(UWT_EVENT_INSPECTOR_CONFIG, { optional: true })
  };

  private readonly enabled = uwtSafe(
    'enabled',
    () =>
      typeof this.config.enabled === 'function'
        ? this.config.enabled()
        : this.config.enabled,
    false
  );

  private host?: UwtInspectorHost;
  private installed = false;
  private warnedBlocked = false;
  private lastKey?: string;

  /** Whether the inspector is currently open, in any dock. */
  readonly isOpen = signal(false);

  private readonly shownIn = signal<UwtInspectorDock | undefined>(undefined);

  /**
   * Where the inspector is shown while open — which can differ from the dock
   * asked for, as a blocked window or a narrow screen makes it a dialog —
   * and `undefined` while closed.
   */
  readonly dock = this.shownIn.asReadonly();

  /** Whether the app's window is wide enough for a pane beside it. */
  private readonly panesFit = signal(true);

  constructor() {
    this.session.controls = {
      setDock: (dock) => this.setDock(dock),
      close: () => this.close(),
      panesFit: this.panesFit.asReadonly()
    };
    this.destroyRef.onDestroy(() => this.close());
    uwtSafeVoid('width', () => this.watchWidth());
  }

  /**
   * Starts listening for the shortcut, and keeping events from before
   * opening when `captureBeforeOpen` asks for it. Called by
   * {@link provideUwtEventInspector}; does nothing on the server, when
   * disabled, or a second time.
   */
  install(): void {
    if (this.installed || !this.isBrowser || !this.enabled) {
      return;
    }
    this.installed = true;
    uwtSafeVoid('captureBeforeOpen', () =>
      this.ring.start(
        Math.min(this.config.captureBeforeOpen, this.config.maxEventsPerSection)
      )
    );
    if (this.config.shortcuts.length === 0) {
      return;
    }

    // Capture phase, so it works even where a component stops propagation.
    // Outside Angular's zone, so ordinary typing triggers no change detection.
    this.zone.runOutsideAngular(() =>
      this.document.addEventListener('keydown', this.onKeydown, true)
    );
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('keydown', this.onKeydown, true)
    );
  }

  /** Opens the inspector where it was last, or focuses it when open. */
  open(): void {
    if (!this.enabled || !this.isBrowser) {
      return;
    }
    if (this.host) {
      this.host.focus();
      return;
    }
    this.show(this.preferences.read().dock);
  }

  /**
   * Moves the inspector to `dock`, opening it there when closed, and
   * remembers the choice. Its captured events, filters and pause carry
   * over. Opening a window must happen during a click or key press, or the
   * browser blocks it; the inspector then opens as a dialog.
   */
  setDock(dock: UwtInspectorDock): void {
    if (!this.enabled || !this.isBrowser) {
      return;
    }
    this.preferences.update({ dock });
    if (this.host?.dock === dock) {
      // Already there: rebuilding would only lose its page and expanded rows.
      this.open();
      return;
    }
    const previous = this.host;
    this.host = undefined;
    uwtSafeVoid('setDock', () => previous?.destroy());
    this.show(dock);
  }

  /** Closes the inspector, discarding what it captured. */
  close(): void {
    const host = this.host;
    this.host = undefined;
    uwtSafeVoid('close', () => host?.destroy());
    this.session.end();
    this.isOpen.set(false);
    this.shownIn.set(undefined);
  }

  /**
   * What the shortcut does: open when closed; with the inspector open,
   * close it if focus is inside, otherwise bring focus back to it.
   */
  toggle(): void {
    if (!this.host) {
      this.open();
    } else if (this.host.containsFocus()) {
      this.close();
    } else {
      this.host.focus();
    }
  }

  private readonly onKeydown = (event: KeyboardEvent): void =>
    uwtSafeVoid('shortcut', () => {
      // A shortcut like Shift+E+I needs the key pressed before this one.
      const previous = this.lastKey;
      this.lastKey = event.code;
      if (
        !this.config.shortcuts.some((s) =>
          uwtMatchesShortcut(event, s, previous)
        )
      ) {
        return;
      }
      event.preventDefault();
      this.zone.run(() => this.toggle());
    });

  /** Keeps {@link panesFit} up to date as the app's window is resized. */
  private watchWidth(): void {
    const narrow = this.isBrowser
      ? this.document.defaultView?.matchMedia?.(NARROW)
      : undefined;
    if (!narrow) {
      return;
    }
    this.panesFit.set(!narrow.matches);
    const onChange = (event: MediaQueryListEvent) =>
      this.panesFit.set(!event.matches);
    narrow.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() =>
      narrow.removeEventListener('change', onChange)
    );
  }

  /** Whether the app's window is too narrow for a pane, right now. */
  private isNarrow(): boolean {
    // A fresh query: one made earlier catches up with a resize a frame late.
    return !!this.document.defaultView?.matchMedia?.(NARROW).matches;
  }

  /** Shows it in `dock`; a pane on a narrow screen shows as a dialog. */
  private show(dock: UwtInspectorDock): void {
    uwtSafeVoid('open', () => {
      this.host =
        dock === 'window'
          ? (this.openWindow() ?? this.openDialog())
          : dock === 'dialog' || this.isNarrow()
            ? this.openDialog()
            : this.openPane(dock);
      this.isOpen.set(true);
      this.shownIn.set(this.host.dock);
    });
    // A dialog focuses itself once rendered; a pane or window is ready now.
    uwtSafeVoid('focus', () => this.host?.focus());
  }

  /** The user closed it themselves: the dialog's ✕ or Escape, the window. */
  private closedByUser(host: UwtInspectorHost): void {
    if (this.host === host) {
      this.close();
    }
  }

  private openDialog(): UwtInspectorHost {
    const ref: CpsDialogRef<UwtInspectorComponent> = this.dialogs.open(
      UwtInspectorComponent,
      {
        headerTitle: 'Event Inspector',
        ariaLabel: 'Event Inspector',
        modal: false,
        draggable: true,
        resizable: true,
        maximizable: true,
        closeOnEscape: true,
        // Docked right at half the screen, so the application stays
        // visible and clickable beside it, but never narrower than 40rem
        // (nearly all of a small screen), so the tables have room;
        // resizable, and maximizable for a closer look.
        position: 'right',
        width: 'clamp(min(40rem, 96vw), 50vw, 64rem)',
        height: '88vh',
        minWidth: 'min(22rem, 96vw)',
        autoFocus: '.uwt-inspector-search input',
        // Hooks the title's alignment; see the inspector's styles.
        styleClass: 'uwt-inspector-dialog'
      }
    );
    const host: UwtInspectorHost = {
      dock: 'dialog',
      focus: () => ref.componentInstance?.focusSearch(),
      containsFocus: () => !!ref.componentInstance?.containsFocus(),
      destroy: () => ref.close()
    };
    ref.onDestroy.subscribe(() => this.closedByUser(host));
    return host;
  }

  private openPane(side: UwtInspectorPaneSide): UwtInspectorHost {
    const element = this.document.body.appendChild(
      this.document.createElement('uwt-inspector-pane')
    );
    const ref = createComponent(UwtInspectorPaneComponent, {
      environmentInjector: this.environment,
      hostElement: element
    });
    ref.setInput('side', side);
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    return {
      dock: side,
      focus: () => ref.instance.content().focusSearch(),
      containsFocus: () => ref.instance.content().containsFocus(),
      // Destroying the view detaches it from the app, unless the app, being
      // destroyed, already has: detaching it here would warn (NG0406).
      destroy: () => {
        ref.destroy();
        element.remove();
      }
    };
  }

  private openWindow(): UwtInspectorHost | undefined {
    const application = this.identity?.application;
    const host = uwtOpenInspectorWindow({
      document: this.document,
      environment: this.environment,
      appRef: this.appRef,
      title: application
        ? `Event Inspector · ${application}`
        : 'Event Inspector',
      geometry: this.preferences.read().window,
      onClosed: () => host && this.closedByUser(host),
      onKeydown: this.onKeydown,
      onGeometry: (window) => this.preferences.update({ window })
    });
    if (!host && !this.warnedBlocked) {
      this.warnedBlocked = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[ngx-ui-watchtower] the browser blocked the Event Inspector window; it opens as a dialog instead. Open it from a click or key press, or allow pop-ups for this site'
      );
    }
    return host;
  }
}
