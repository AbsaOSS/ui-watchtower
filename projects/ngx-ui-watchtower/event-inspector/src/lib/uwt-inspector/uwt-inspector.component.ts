import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  NgZone,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CPS_LIVE_ANNOUNCER_SERVICE,
  CpsButtonComponent,
  CpsDialogConfig,
  CpsDialogRef,
  CpsSwitchComponent
} from 'cps-ui-kit';
import { CpsSliderComponent } from '../cps-slider/cps-slider.component';
import {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtInspectorDock
} from '../uwt-inspector.models/uwt-inspector.models';
import {
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_INSPECTOR_SECTIONS,
  UwtInspectorStore
} from '../uwt-inspector-store/uwt-inspector-store';
import { UwtInspectorTimelineComponent } from '../uwt-inspector-timeline/uwt-inspector-timeline.component';
import {
  UWT_INSPECTOR_SECTION_NOUN,
  UwtInspectorExporter
} from '../uwt-inspector-export/uwt-inspector-exporter';
import { uwtInspectorTime } from '../uwt-inspector-timeline/uwt-inspector-rows';
import {
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  uwtIsApplePlatform,
  uwtShortcutLabel
} from '../uwt-inspector-shortcut/uwt-inspector-shortcut';
import { UwtInspectorDockSwitcherComponent } from '../uwt-inspector-dock-switcher/uwt-inspector-dock-switcher.component';
import { UwtInspectorLogoComponent } from '../uwt-inspector-logo/uwt-inspector-logo.component';
import { UwtInspectorSession } from '../uwt-inspector-session/uwt-inspector-session';
import {
  UWT_INSPECTOR_MAX_TRANSPARENCY,
  UwtInspectorPreferenceStorage
} from '../uwt-inspector-preferences/uwt-inspector-preferences';

/** Screen readers hear about new events at most this often, in ms. */
const ANNOUNCE_EVERY_MS = 10_000;

/**
 * The Event Inspector's content, shown by {@link UwtEventInspectorService}
 * in a non-modal cps-dialog, a pane or its own window. Capturing is
 * controlled here — pause and clear apply to everything — while the
 * timeline below shows, filters and exports the events.
 *
 * The captured history belongs to the {@link UwtInspectorSession}, so it
 * survives moving between docks and is discarded on close. Uses no
 * telemetry service itself, so opening or using it never produces events
 * of its own.
 */
@Component({
  selector: 'uwt-inspector',
  imports: [
    CpsButtonComponent,
    CpsSliderComponent,
    CpsSwitchComponent,
    UwtInspectorDockSwitcherComponent,
    UwtInspectorLogoComponent,
    UwtInspectorTimelineComponent
  ],
  providers: [
    {
      provide: UwtInspectorStore,
      useFactory: () => inject(UwtInspectorSession).store
    },
    UwtInspectorExporter
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Focusable, but not in the tab order: see focusInspector().
    tabindex: '-1',
    '[class.uwt-inspector--framed]': 'framed()',
    '(keydown.escape)': 'onEscape($event)'
  },
  templateUrl: './uwt-inspector.component.html',
  styleUrl: './uwt-inspector.component.scss'
})
export class UwtInspectorComponent {
  /** Where it is shown; a cps-dialog creates it without inputs. */
  readonly dock = input<UwtInspectorDock>('dialog');

  protected readonly store = inject(UwtInspectorStore);

  private readonly document = inject(DOCUMENT);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly session = inject(UwtInspectorSession);
  private readonly preferences = inject(UwtInspectorPreferenceStorage);
  private readonly announcer = inject(CPS_LIVE_ANNOUNCER_SERVICE, {
    optional: true
  });

  /** The dialog's own config: cps-dialog binds its `style` to the window. */
  private readonly dialogConfig = inject(CpsDialogConfig, { optional: true });
  private readonly dialogRef = inject(CpsDialogRef, { optional: true });

  private readonly config = {
    ...UWT_DEFAULT_INSPECTOR_CONFIG,
    shortcuts: UWT_DEFAULT_INSPECTOR_SHORTCUTS,
    ...inject(UWT_EVENT_INSPECTOR_CONFIG, { optional: true })
  };

  /** A pane or window brings no header of its own, so this draws one. */
  protected readonly framed = computed(() => this.dock() !== 'dialog');

  /** Whether the app's window has room for a pane. */
  protected readonly panesFit =
    this.session.controls?.panesFit ?? signal(true).asReadonly();

  protected readonly maxPayloadChars = this.config.maxPayloadCharsInView;

  protected readonly since = computed(() =>
    uwtInspectorTime(this.store.startedAt()).slice(0, 8)
  );

  /** The oldest events dropped to stay within each kind's limit. */
  protected readonly dropped = computed(() => {
    const dropped = this.store.dropped();
    return UWT_INSPECTOR_SECTIONS.reduce((n, id) => n + dropped[id], 0);
  });

  protected readonly pausedAt = computed(() => {
    const at = this.store.pausedAt();
    return at && uwtInspectorTime(at).slice(0, 8);
  });

  protected readonly shortcut = uwtShortcutLabel(
    this.config.shortcuts,
    uwtIsApplePlatform(this.document.defaultView?.navigator)
  );

  protected readonly maxTransparency = UWT_INSPECTOR_MAX_TRANSPARENCY;
  protected readonly transparency = signal(
    this.preferences.read().transparency
  );

  /** A maximized dialog covers the app, so it isn't see-through. */
  protected readonly maximized = signal(false);

  private readonly dialogLogo = viewChild('dialogLogo', { read: ElementRef });

  private readonly pauseSwitch = viewChild('pauseSwitch', { read: ElementRef });

  private readonly injector = inject(Injector);

  /** From what the session already holds: a dock move announces no history. */
  private lastAnnounced = { ...this.store.received() };

  constructor() {
    const timer = setInterval(() => this.announceNew(), ANNOUNCE_EVERY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.applyTransparency(this.transparency());
    this.dialogRef?.onMaximize
      .pipe(takeUntilDestroyed())
      .subscribe((maximized) => {
        this.maximized.set(maximized);
        this.applyTransparency(maximized ? 0 : this.transparency());
      });
    afterNextRender(() => this.placeDialogLogo());
    this.keepScrollingInside();
  }

  /**
   * The inspector is fixed, so the page scrolls under it, and two things
   * follow.
   *
   * cps-ui-kit puts an open list in the page, and closes it when a scrolling
   * parent of its field scrolls, which the page is not for a fixed pane: the
   * list would drift away from its field. Each dock has such a parent, the
   * body or the dialog's content, so the page's scroll is passed on to it.
   * Only the inspector's elements hear it. Scrolling inside the inspector or
   * an open list is the kit's own.
   *
   * And a part that can't scroll, or has scrolled as far as it goes, passes
   * the wheel on to the page. `overscroll-behavior` stops that in some
   * browsers; the rest, and the header, are held here, unless a part under
   * the pointer can scroll that way. A pinch zoom is left alone.
   */
  private keepScrollingInside(): void {
    const host = this.host.nativeElement;
    let passing = false;

    this.listen(this.document, 'scroll', (event: Event) => {
      const target = event.target;
      if (
        passing ||
        (target instanceof Node && host.contains(target)) ||
        (target instanceof Element && target.closest('.cps-menu-container'))
      ) {
        return;
      }
      passing = true;
      [
        host.querySelector('.uwt-inspector__body'),
        host.closest('.cps-dialog-content')
      ].forEach((el) => el?.dispatchEvent(new Event('scroll')));
      passing = false;
    });

    this.listen(host, 'wheel', (event: WheelEvent) => {
      if (event.ctrlKey || event.defaultPrevented) {
        return;
      }
      // In the dialog, the frame's scrolling content holds the inspector.
      const limit = host.closest('.cps-dialog') ?? host;
      const down = event.deltaY > 0;
      const canScroll = (el: Element): boolean =>
        /auto|scroll/.test(getComputedStyle(el).overflowY) &&
        // A pixel's slack, for fractional positions.
        (down
          ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
          : el.scrollTop > 0);
      for (
        let el = event.target instanceof Element ? event.target : null;
        el && limit.contains(el);
        el = el.parentElement
      ) {
        if (canScroll(el)) {
          return;
        }
      }
      event.preventDefault();
    });
  }

  /** Listens once rendered, outside the zone, until destroyed. */
  private listen<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void
  ): void {
    const zone = inject(NgZone);
    const destroyRef = inject(DestroyRef);
    // Scroll doesn't bubble: capture sees every element's. Wheel can be stopped.
    const options = { capture: type === 'scroll', passive: type !== 'wheel' };
    afterNextRender(() => {
      const listener = handler as (event: Event) => void;
      zone.runOutsideAngular(() =>
        target.addEventListener(type, listener, options)
      );
      destroyRef.onDestroy(() =>
        target.removeEventListener(type, listener, options)
      );
    });
  }

  /** Whether keyboard focus is anywhere in the inspector, header included. */
  containsFocus(): boolean {
    return this.frame().contains(this.document.activeElement);
  }

  /**
   * Moves focus to the inspector itself, not to a field, where the shortcut
   * types: so the shortcut closes it next. Not to cps-dialog's own frame
   * either, whose focus ring covers the dialog and takes its clicks.
   */
  focusInspector(): void {
    this.host.nativeElement.focus();
  }

  protected setDock(dock: UwtInspectorDock): void {
    this.session.controls?.setDock(dock);
  }

  protected close(): void {
    this.session.controls?.close();
  }

  /**
   * Escape closes the dialog, but only from inside it — it isn't modal, and
   * the app's own controls use Escape too — and not while one of its lists
   * or menus is open, which Escape closes first.
   */
  protected onEscape(event: Event): void {
    const target = event.target as Element | null;
    if (
      this.dock() === 'dialog' &&
      !event.defaultPrevented &&
      !target?.closest?.('[aria-expanded="true"]')
    ) {
      this.close();
    }
  }

  /** Resumes from the notice, which then goes: focus to the Pause switch. */
  protected resume(): void {
    this.setPaused(false);
    afterNextRender(
      () =>
        (this.pauseSwitch()?.nativeElement as HTMLElement | undefined)
          ?.querySelector('input')
          ?.focus(),
      { injector: this.injector }
    );
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

  /** Lets the app show through the dialog, and remembers the choice. */
  protected setTransparency(percent: number): void {
    this.transparency.set(percent);
    this.applyTransparency(percent);
    this.preferences.update({ transparency: percent });
  }

  /**
   * A new `style` object, rather than this component's own styles, so the
   * dialog's header and frame turn see-through too. Only a dialog has one.
   */
  private applyTransparency(percent: number): void {
    if (this.dialogConfig) {
      this.dialogConfig.style = {
        ...this.dialogConfig.style,
        opacity: String((100 - percent) / 100)
      };
    }
  }

  /**
   * cps-dialog draws the dialog's header, and its icon slot takes only an
   * icon name, so the mark moves into that slot, before the title. Without
   * the slot the mark goes.
   */
  private placeDialogLogo(): void {
    const logo: HTMLElement | undefined = this.dialogLogo()?.nativeElement;
    if (!logo) {
      return;
    }
    const slot = this.host.nativeElement
      .closest('.cps-dialog')
      ?.querySelector('.cps-dialog-header-icon');
    if (slot) {
      slot.append(logo);
    } else {
      logo.remove();
    }
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
      // Announcements are a courtesy; never let one break the inspector.
    }
  }

  /** The dialog or pane around this content, or the content itself. */
  private frame(): HTMLElement {
    return (
      this.host.nativeElement.closest<HTMLElement>(
        '[role="dialog"], [role="region"]'
      ) ?? this.host.nativeElement
    );
  }
}
