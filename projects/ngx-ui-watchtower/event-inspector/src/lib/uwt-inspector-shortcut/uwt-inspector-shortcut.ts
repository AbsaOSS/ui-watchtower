import { UwtInspectorShortcut } from '../uwt-inspector.models/uwt-inspector.models';

/**
 * The default shortcut, the same on every platform: Shift+E+I — hold Shift,
 * press E, then I — for Event Inspector.
 *
 * No browser binds it. It types text, so it is ignored in text fields:
 * typing a capital "EI" there never opens the inspector.
 *
 * @group Utils
 */
export const UWT_DEFAULT_INSPECTOR_SHORTCUTS: readonly UwtInspectorShortcut[] =
  [{ code: 'KeyI', after: 'KeyE', shift: true }];

/**
 * Whether `event` is exactly `shortcut`, given the key pressed just before
 * it (`previous`, a `KeyboardEvent.code`).
 *
 * - The physical key is compared (`code`), never the produced character —
 *   Option turns 8 into `•` on macOS, and Shift turns it into `*`.
 * - Every modifier must match; one left out must be up.
 * - Held-down repeats don't count.
 * - AltGr is rejected. On many European Windows layouts it reports as
 *   Ctrl+Alt, and typing an AltGr character must never open the popup.
 * - Without Ctrl or ⌘, a key that types a character doesn't count in a text
 *   field, even one inside a shadow root.
 */
export function uwtMatchesShortcut(
  event: KeyboardEvent,
  shortcut: UwtInspectorShortcut,
  previous?: string
): boolean {
  if (event.repeat || event.code !== shortcut.code) {
    return false;
  }
  if (shortcut.after !== undefined && previous !== shortcut.after) {
    return false;
  }
  if (event.getModifierState?.('AltGraph')) {
    return false;
  }
  if (!shortcut.ctrl && !shortcut.meta && typesIntoField(event)) {
    return false;
  }
  return (
    event.ctrlKey === !!shortcut.ctrl &&
    event.altKey === !!shortcut.alt &&
    event.shiftKey === !!shortcut.shift &&
    event.metaKey === !!shortcut.meta
  );
}

/**
 * Whether `event` types a character — or starts one, as a dead key or an
 * IME does — into an input, a text area or an editor. Inside a shadow root,
 * `target` is only its host, so the path's first element is read instead.
 */
function typesIntoField(event: KeyboardEvent): boolean {
  const key = event.key ?? '';
  if (key.length !== 1 && key !== 'Dead' && key !== 'Process') {
    return false;
  }
  const element = (event.composedPath?.()[0] ??
    event.target) as HTMLElement | null;
  return (
    !!element &&
    (element.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
  );
}
