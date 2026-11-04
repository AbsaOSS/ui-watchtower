import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  inject,
  Injectable,
  NgZone,
  PLATFORM_ID,
  signal
} from '@angular/core';
import { CpsDialogRef, CpsDialogService } from 'cps-ui-kit';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig
} from '../uwt-inspector.models/uwt-inspector.models';
import { UWT_DEFAULT_INSPECTOR_CONFIG } from '../uwt-inspector-store/uwt-inspector-store';
import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  uwtMatchesShortcut
} from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import { UwtInspectorDialogComponent } from '../uwt-inspector-dialog/uwt-inspector-dialog.component';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/**
 * Opens and closes the Event Inspector, and listens for its
 * keyboard shortcut once {@link provideUwtEventInspector} installs it.
 *
 * The popup is non-modal: the application stays usable while events
 * arrive. With the popup open, the shortcut returns focus to it from the
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
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
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

  private ref?: CpsDialogRef<UwtInspectorDialogComponent>;
  private installed = false;

  /** Whether the popup is currently open. */
  readonly isOpen = signal(false);

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

    const listener = (event: KeyboardEvent) =>
      uwtSafeVoid('shortcut', () => {
        if (!this.config.shortcuts.some((s) => uwtMatchesShortcut(event, s))) {
          return;
        }
        event.preventDefault();
        this.zone.run(() => this.onShortcut());
      });

    // Capture phase, so it works even where a component stops propagation.
    // Outside Angular's zone, so ordinary typing triggers no change detection.
    this.zone.runOutsideAngular(() =>
      this.document.addEventListener('keydown', listener, true)
    );
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('keydown', listener, true);
      this.close();
    });
  }

  /** Opens the popup, or moves focus into it when already open. */
  open(): void {
    if (!this.enabled || !this.isBrowser) {
      return;
    }
    if (this.ref) {
      this.ref.componentInstance?.focusSearch();
      return;
    }
    uwtSafeVoid('open', () => {
      const ref: CpsDialogRef<UwtInspectorDialogComponent> = this.dialogs.open(
        UwtInspectorDialogComponent,
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
      this.ref = ref;
      this.isOpen.set(true);
      ref.onDestroy.subscribe(() => {
        if (this.ref === ref) {
          this.ref = undefined;
          this.isOpen.set(false);
        }
      });
    });
  }

  /** Closes the popup, discarding what it captured. */
  close(): void {
    uwtSafeVoid('close', () => this.ref?.close());
  }

  /**
   * What the shortcut does: open when closed; with the popup open, close
   * it if focus is inside, otherwise bring focus back to it.
   */
  toggle(): void {
    if (!this.ref) {
      this.open();
    } else if (this.ref.componentInstance?.containsFocus()) {
      this.close();
    } else {
      this.ref.componentInstance?.focusSearch();
    }
  }

  private onShortcut(): void {
    this.toggle();
  }
}
