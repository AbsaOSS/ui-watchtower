import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal
} from '@angular/core';
import {
  CPS_LIVE_ANNOUNCER_SERVICE,
  CpsButtonComponent,
  CpsDialogConfig,
  CpsSwitchComponent
} from 'cps-ui-kit';
import { CpsSliderComponent } from '../cps-slider/cps-slider.component';
import { UWT_EVENT_INSPECTOR_CONFIG } from '../uwt-inspector.models/uwt-inspector.models';
import {
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_INSPECTOR_SECTIONS,
  UwtInspectorStore
} from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorSectionComponent } from '../uwt-inspector-section/uwt-inspector-section.component';
import {
  UWT_INSPECTOR_SECTION_NOUN,
  UwtInspectorExporter
} from '../uwt-inspector-export/uwt-inspector-exporter';
import { uwtInspectorTime } from '../uwt-inspector-section/uwt-inspector-columns';
import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  uwtIsApplePlatform,
  uwtShortcutLabel
} from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/** Screen readers hear about new events at most this often, in ms. */
const ANNOUNCE_EVERY_MS = 10_000;

/** How see-through the window can get, in percent, so it never vanishes. */
export const UWT_INSPECTOR_MAX_TRANSPARENCY = 70;

/** Where this browser remembers the chosen transparency. */
export const UWT_INSPECTOR_TRANSPARENCY_KEY =
  'ngx-ui-watchtower.eventInspector.transparency';

/**
 * The Event Inspector's content, opened by
 * {@link UwtEventInspectorService} inside a non-modal cps-dialog.
 * Capturing is controlled here — pause and clear apply to everything —
 * while each section filters, downloads and copies its own events.
 *
 * Owns its {@link UwtInspectorStore}, so the captured history lives
 * exactly as long as this window: it starts empty and is discarded on
 * close. Uses no telemetry service itself, so opening or using it never
 * produces events of its own.
 */
@Component({
  selector: 'uwt-inspector-dialog',
  imports: [
    CpsButtonComponent,
    CpsSliderComponent,
    CpsSwitchComponent,
    UwtInspectorSectionComponent
  ],
  providers: [UwtInspectorStore, UwtInspectorExporter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './uwt-inspector-dialog.component.html',
  styleUrl: './uwt-inspector-dialog.component.scss'
})
export class UwtInspectorDialogComponent {
  protected readonly store = inject(UwtInspectorStore);

  private readonly document = inject(DOCUMENT);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly announcer = inject(CPS_LIVE_ANNOUNCER_SERVICE, {
    optional: true
  });

  /** The window's own config: cps-dialog binds its `style` to the window. */
  private readonly dialogConfig = inject(CpsDialogConfig, { optional: true });

  private readonly config = {
    ...UWT_DEFAULT_INSPECTOR_CONFIG,
    shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS,
    ...inject(UWT_EVENT_INSPECTOR_CONFIG, { optional: true })
  };

  protected readonly sections = UWT_INSPECTOR_SECTIONS;
  protected readonly maxPayloadChars = this.config.maxPayloadCharsInView;

  protected readonly since = computed(() =>
    uwtInspectorTime(this.store.startedAt()).slice(0, 8)
  );

  protected readonly shortcut = uwtShortcutLabel(
    this.config.shortcuts,
    uwtIsApplePlatform(this.document.defaultView?.navigator)
  );

  protected readonly maxTransparency = UWT_INSPECTOR_MAX_TRANSPARENCY;
  protected readonly transparency = signal(this.storedTransparency());

  private lastAnnounced = { bi: 0, scenario: 0, logging: 0 };

  constructor() {
    const timer = setInterval(() => this.announceNew(), ANNOUNCE_EVERY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.applyTransparency(this.transparency());
  }

  /** Whether keyboard focus is anywhere in the popup, header included. */
  containsFocus(): boolean {
    const dialog = this.dialogElement();
    return !!dialog && dialog.contains(this.document.activeElement);
  }

  /** Moves focus to the search field. */
  focusSearch(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>(
      '.uwt-inspector-search input'
    );
    (input ?? this.dialogElement())?.focus();
  }

  protected setPaused(paused: boolean): void {
    this.store.setPaused(paused);
    this.announce(
      paused
        ? 'Live updates paused. Events are still captured.'
        : 'Live updates resumed.'
    );
  }

  protected clear(): void {
    this.store.clear();
    this.lastAnnounced = { bi: 0, scenario: 0, logging: 0 };
    this.announce('History cleared. Capturing continues.');
  }

  /** Lets the app show through the window, and remembers the choice. */
  protected setTransparency(percent: number): void {
    this.transparency.set(percent);
    this.applyTransparency(percent);
    uwtSafeVoid('transparency.save', () =>
      this.document.defaultView?.localStorage.setItem(
        UWT_INSPECTOR_TRANSPARENCY_KEY,
        String(percent)
      )
    );
  }

  /**
   * A new `style` object, rather than this component's own styles, so the
   * window's header and frame turn see-through too.
   */
  private applyTransparency(percent: number): void {
    if (this.dialogConfig) {
      this.dialogConfig.style = {
        ...this.dialogConfig.style,
        opacity: String((100 - percent) / 100)
      };
    }
  }

  /** The last choice in this browser, or fully opaque. */
  private storedTransparency(): number {
    const stored = uwtSafe(
      'transparency.read',
      () =>
        Number(
          this.document.defaultView?.localStorage.getItem(
            UWT_INSPECTOR_TRANSPARENCY_KEY
          )
        ),
      0
    );
    return stored >= 0 && stored <= UWT_INSPECTOR_MAX_TRANSPARENCY ? stored : 0;
  }

  /** One polite summary of what arrived since the last one, if anything. */
  private announceNew(): void {
    if (this.store.paused()) {
      return;
    }
    const received = this.store.received();
    const parts = UWT_INSPECTOR_SECTIONS.map((id) => ({
      id,
      n: received[id] - this.lastAnnounced[id]
    })).filter((p) => p.n > 0);
    this.lastAnnounced = { ...received };
    if (parts.length === 0) {
      return;
    }
    const total = parts.reduce((sum, p) => sum + p.n, 0);
    const detail = parts
      .map((p) => `${p.n} ${UWT_INSPECTOR_SECTION_NOUN[p.id]}`)
      .join(', ');
    this.announce(`${total} new event${total === 1 ? '' : 's'}: ${detail}.`);
  }

  private announce(message: string): void {
    try {
      this.announcer?.announce(message, 'polite');
    } catch {
      // Announcements are a courtesy; never let one break the popup.
    }
  }

  private dialogElement(): HTMLElement | null {
    return this.host.nativeElement.closest<HTMLElement>('[role="dialog"]');
  }
}
