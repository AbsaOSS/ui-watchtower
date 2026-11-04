import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnDestroy,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { UwtInspectorPaneSide } from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorComponent } from '../uwt-inspector/uwt-inspector.component';
import { UwtInspectorPreferenceStorage } from '../uwt-inspector-preferences/uwt-inspector-preferences';

/** Narrowest a left or right pane gets, in rem, so its tables stay usable. */
const SIDE_MIN_REM = 30;
/** Lowest a bottom pane gets, in rem. */
const BOTTOM_MIN_REM = 12;
/** A pane never takes more than this share of the viewport. */
const MAX_SHARE = 0.8;
/** How far one arrow key press resizes, in rem. */
const STEP_REM = 2;

/**
 * The inspector docked beside or below the app, like Chrome DevTools. It
 * makes room by padding the page's `body` on its side, so content in the
 * normal flow moves aside. Elements placed against the window — fixed
 * headers, `100vh` shells — can't be moved from here, so it also publishes
 * its size as `--uwt-inspector-inset-left`, `-right` or `-bottom` on
 * `<html>`, for the app's CSS to use. Resized by dragging or with the arrow
 * keys on its inner edge, and remembers its size per side.
 */
@Component({
  selector: 'uwt-inspector-pane',
  imports: [UwtInspectorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'region',
    'aria-label': 'Event Inspector',
    '[class.uwt-inspector-pane--left]': "side() === 'left'",
    '[class.uwt-inspector-pane--right]': "side() === 'right'",
    '[class.uwt-inspector-pane--bottom]': "side() === 'bottom'",
    '[style.width.px]': "side() === 'bottom' ? null : size()",
    '[style.height.px]': "side() === 'bottom' ? size() : null",
    '(window:resize)': 'resize(size())'
  },
  templateUrl: './uwt-inspector-pane.component.html',
  styleUrl: './uwt-inspector-pane.component.scss'
})
export class UwtInspectorPaneComponent implements OnInit, OnDestroy {
  readonly side = input.required<UwtInspectorPaneSide>();

  /** The inspector inside, for focus. */
  readonly content = viewChild.required(UwtInspectorComponent);

  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UwtInspectorPreferenceStorage);

  protected readonly size = signal(0);
  protected readonly limits = signal({ min: 0, max: 0 });

  private padding = '';
  private paddingBefore = '';
  private inset = '';
  private dragging = false;

  ngOnInit(): void {
    this.padding = `padding-${this.side()}`;
    this.paddingBefore = this.document.body.style.getPropertyValue(
      this.padding
    );
    this.inset = `--uwt-inspector-inset-${this.side()}`;
    this.resize(
      this.preferences.read().paneSize[this.side()] ?? this.defaultSize()
    );
  }

  ngOnDestroy(): void {
    this.document.body.style.setProperty(this.padding, this.paddingBefore);
    this.document.documentElement.style.removeProperty(this.inset);
  }

  /** Sets the size within its limits, and makes room for it. */
  protected resize(size: number): void {
    const rem = this.rem();
    const bottom = this.side() === 'bottom';
    const view = this.document.defaultView;
    const extent = (bottom ? view?.innerHeight : view?.innerWidth) ?? 0;
    const min = (bottom ? BOTTOM_MIN_REM : SIDE_MIN_REM) * rem;
    const max = Math.max(extent * MAX_SHARE, 0);
    const clamped = Math.round(Math.min(max, Math.max(min, size)));
    this.limits.set({
      min: Math.round(Math.min(min, max)),
      max: Math.round(max)
    });
    this.size.set(clamped);
    this.document.body.style.setProperty(this.padding, `${clamped}px`);
    this.document.documentElement.style.setProperty(this.inset, `${clamped}px`);
  }

  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.dragging = true;
  }

  protected drag(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    const view = this.document.defaultView;
    const side = this.side();
    this.resize(
      side === 'left'
        ? event.clientX
        : side === 'right'
          ? (view?.innerWidth ?? 0) - event.clientX
          : (view?.innerHeight ?? 0) - event.clientY
    );
  }

  protected endDrag(): void {
    if (this.dragging) {
      this.dragging = false;
      this.save();
    }
  }

  /** Arrow keys toward the app grow the pane; away from it, shrink it. */
  protected resizeByKey(event: KeyboardEvent): void {
    const grow = { left: 'ArrowRight', right: 'ArrowLeft', bottom: 'ArrowUp' };
    const shrink = {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      bottom: 'ArrowDown'
    };
    const side = this.side();
    if (event.key !== grow[side] && event.key !== shrink[side]) {
      return;
    }
    event.preventDefault();
    const step = (event.key === grow[side] ? 1 : -1) * STEP_REM * this.rem();
    this.resize(this.size() + step);
    this.save();
  }

  private save(): void {
    this.preferences.update({
      paneSize: {
        ...this.preferences.read().paneSize,
        [this.side()]: this.size()
      }
    });
  }

  private defaultSize(): number {
    const view = this.document.defaultView;
    return this.side() === 'bottom'
      ? (view?.innerHeight ?? 0) * 0.45
      : Math.min(36 * this.rem(), (view?.innerWidth ?? 0) * 0.5);
  }

  private rem(): number {
    const view = this.document.defaultView;
    const size = view
      ? parseFloat(
          view.getComputedStyle(this.document.documentElement).fontSize
        )
      : NaN;
    return Number.isFinite(size) && size > 0 ? size : 16;
  }
}
