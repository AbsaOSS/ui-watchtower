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
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/**
 * Opens and closes the Event Inspector, moves it between docks, and
 * listens for its keyboard shortcut once {@link provideUwtEventInspector}
 * installs it.
 *
 * It opens where it was last — a dialog the first time — and the
 * application stays usable while events arrive. With it open, the shortcut
 * returns focus to it from the application, and closes it when focus is
 * already inside.
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

  constructor() {
    this.session.controls = {
      setDock: (dock) => this.setDock(dock),
      close: () => this.close()
    };
    this.destroyRef.onDestroy(() => this.close());
  }

  /**
   * Starts listening for the shortcut. Called by
   * {@link provideUwtEventInspector}; does nothing on the server,
   * when disabled, with no shortcuts, or when already listening.
   */
  install(): void {
    if (
      this.installed ||
      !this.isBrowser ||
      !this.enabled ||
      this.config.shortcuts.length === 0
    ) {
      return;
    }
    this.installed = true;

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

  private show(dock: UwtInspectorDock): void {
    uwtSafeVoid('open', () => {
      this.host =
        dock === 'dialog'
          ? this.openDialog()
          : dock === 'window'
            ? (this.openWindow() ?? this.openDialog())
            : this.openPane(dock);
      this.isOpen.set(true);
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
        autoFocus: '.uwt-inspector-search input'
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
      destroy: () => {
        this.appRef.detachView(ref.hostView);
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
