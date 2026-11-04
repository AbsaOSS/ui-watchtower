import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import {
  UWT_INSPECTOR_DOCKS,
  UwtInspectorDock,
  UwtInspectorPaneSide
} from '../uwt-inspector.models/uwt-inspector.models';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/** How see-through the dialog can get, in percent, so it never vanishes. */
export const UWT_INSPECTOR_MAX_TRANSPARENCY = 70;

/** Where this browser remembers the Event Inspector's settings. */
export const UWT_INSPECTOR_PREFERENCES_KEY = 'ngx-ui-watchtower.eventInspector';

/** The separate window's size and position, in CSS pixels. */
export interface UwtInspectorWindowGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** What the Event Inspector remembers between openings, in this browser. */
export interface UwtInspectorPreferences {
  dock: UwtInspectorDock;
  /** The dialog's transparency, in percent. */
  transparency: number;
  /** Each pane's width (left, right) or height (bottom), in pixels. */
  paneSize: Partial<Record<UwtInspectorPaneSide, number>>;
  window?: UwtInspectorWindowGeometry;
}

const PANE_SIDES: readonly UwtInspectorPaneSide[] = ['left', 'right', 'bottom'];

/**
 * Reads and writes {@link UwtInspectorPreferences} as one `localStorage`
 * entry. Anything missing or invalid reads as its default, and storage
 * that throws — a private window, blocked site data — is ignored.
 */
@Injectable({ providedIn: 'root' })
export class UwtInspectorPreferenceStorage {
  private readonly document = inject(DOCUMENT);

  read(): UwtInspectorPreferences {
    const stored = uwtSafe(
      'preferences.read',
      () =>
        this.document.defaultView?.localStorage.getItem(
          UWT_INSPECTOR_PREFERENCES_KEY
        ),
      undefined
    );
    return sanitize(parse(stored));
  }

  /** Replaces the given preferences, keeping the others. */
  update(changes: Partial<UwtInspectorPreferences>): void {
    uwtSafeVoid('preferences.write', () =>
      this.document.defaultView?.localStorage.setItem(
        UWT_INSPECTOR_PREFERENCES_KEY,
        JSON.stringify({ ...this.read(), ...changes })
      )
    );
  }
}

function parse(json: string | null | undefined): unknown {
  try {
    return json ? JSON.parse(json) : undefined;
  } catch {
    return undefined;
  }
}

function sanitize(raw: unknown): UwtInspectorPreferences {
  const value = isRecord(raw) ? raw : {};
  const dock = UWT_INSPECTOR_DOCKS.find((d) => d === value.dock);
  const transparency = value.transparency;
  const paneSize: UwtInspectorPreferences['paneSize'] = {};
  const sizes = isRecord(value.paneSize) ? value.paneSize : {};
  for (const side of PANE_SIDES) {
    if (isPositive(sizes[side])) {
      paneSize[side] = sizes[side];
    }
  }
  const geometry = value.window;
  const window =
    isRecord(geometry) &&
    isPositive(geometry.width) &&
    isPositive(geometry.height) &&
    Number.isFinite(geometry.left) &&
    Number.isFinite(geometry.top)
      ? (geometry as unknown as UwtInspectorWindowGeometry)
      : undefined;

  return {
    dock: dock ?? 'dialog',
    transparency:
      typeof transparency === 'number' &&
      transparency >= 0 &&
      transparency <= UWT_INSPECTOR_MAX_TRANSPARENCY
        ? transparency
        : 0,
    paneSize,
    ...(window && {
      window: {
        width: window.width,
        height: window.height,
        left: window.left,
        top: window.top
      }
    })
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
