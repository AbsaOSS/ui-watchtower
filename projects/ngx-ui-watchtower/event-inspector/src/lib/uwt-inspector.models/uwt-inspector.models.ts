import { InjectionToken } from '@angular/core';
import { UwtTelemetryObservedEvent } from '@absaoss-cps/ngx-ui-watchtower';

/**
 * The three sections of the Event Inspector.
 *
 * @group Types
 */
export type UwtInspectorSectionId = 'bi' | 'scenario' | 'logging';

/**
 * Where the Event Inspector opens: a dialog over the app, its own browser
 * window, or a pane beside or below the app.
 *
 * @group Types
 */
export type UwtInspectorDock =
  'dialog' | 'window' | 'left' | 'right' | 'bottom';

/** Every dock, in the order the switcher shows them. */
export const UWT_INSPECTOR_DOCKS: readonly UwtInspectorDock[] = [
  'dialog',
  'window',
  'left',
  'bottom',
  'right'
];

/** The docks that are panes beside or below the app. */
export type UwtInspectorPaneSide = Extract<
  UwtInspectorDock,
  'left' | 'right' | 'bottom'
>;

/**
 * A key combination that opens the Event Inspector.
 *
 * Matched on `KeyboardEvent.code` — the physical key — so it works on every
 * keyboard layout, and isn't affected by what Option or Shift produce.
 * A modifier left out must be *up*, so extra modifiers never match.
 *
 * @group Interfaces
 */
export interface UwtInspectorShortcut {
  /** `KeyboardEvent.code`, e.g. `'Digit8'` or `'KeyD'`. */
  code: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;

  /** How the shortcut is written for people, e.g. `'⇧⌥⌘8'`. */
  label?: string;
}

/**
 * Configuration for {@link provideUwtEventInspector}.
 *
 * @group Interfaces
 */
export interface UwtEventInspectorConfig {
  /**
   * Whether the popup can be opened at all. A function is read once, at
   * startup — use it to limit access to, say, support staff.
   */
  enabled: boolean | (() => boolean);

  /**
   * Shortcuts that open the popup. An empty array disables the keyboard,
   * leaving {@link UwtEventInspectorService.open} as the only way in.
   */
  shortcuts: readonly UwtInspectorShortcut[];

  /** Events kept per section; the oldest are dropped beyond this. */
  maxEventsPerSection: number;

  /**
   * Payloads whose JSON is longer than this many characters are shown
   * truncated to this many, at most 65,536. The download always contains
   * them in full.
   *
   * Characters (UTF-16 code units, JavaScript's `length`), not bytes: the
   * limit protects rendering, which costs by the length of the text.
   */
  maxPayloadCharsInView: number;
}

/** @group Tokens */
export const UWT_EVENT_INSPECTOR_CONFIG =
  new InjectionToken<UwtEventInspectorConfig>('UWT_EVENT_INSPECTOR_CONFIG');

/** A flattened leaf of an event, used for filtering. */
export interface UwtInspectorField {
  /** Exact path, e.g. `steps[2].name`. */
  path: string;

  /** Path with array indexes removed, e.g. `steps[].name`. */
  pattern: string;

  /** The value as text. */
  value: string;
}

/** One captured event, prepared once for display and filtering. */
export interface UwtInspectorEntry {
  event: UwtTelemetryObservedEvent;
  section: UwtInspectorSectionId;
  fields: readonly UwtInspectorField[];
  /** Length of the payload's JSON, in characters (UTF-16 code units). */
  sizeChars: number;
  /** Set when the event could not be prepared for display. */
  renderError?: string;
}

/**
 * How a field filter compares.
 *
 * @group Types
 */
export type UwtInspectorFilterOperator =
  'contains' | 'equals' | 'not-contains' | 'exists' | 'missing';

/** @group Interfaces */
export interface UwtInspectorFieldFilter {
  id: string;
  path: string;
  operator: UwtInspectorFilterOperator;
  value: string;
}

/** @group Interfaces */
export interface UwtInspectorFilterState {
  /** Free text, matched against every value and path. */
  text: string;
  fields: readonly UwtInspectorFieldFilter[];
}

/**
 * A downloaded JSON file: one section's captured events.
 *
 * `events` holds every event captured in that section, oldest first,
 * regardless of the filters on screen. `activeFilters` records that
 * section's filters, for context; they were not applied to `events`.
 *
 * @group Interfaces
 */
export interface UwtInspectorExport {
  format: 'ngx-ui-watchtower-event-inspector';
  formatVersion: 1;
  section: UwtInspectorSectionId;
  exportedAt: string;
  capture: { startedAt: string; endedAt: string; paused: boolean };
  app: {
    application: string;
    environment: string;
    version: string;
    eventNamespace: string;
  };
  session: { sessionId?: string; userId?: string };
  userAgent: string;
  activeFilters: UwtInspectorFilterState;
  count: { captured: number; droppedOldest: number };
  events: UwtTelemetryObservedEvent[];
}
