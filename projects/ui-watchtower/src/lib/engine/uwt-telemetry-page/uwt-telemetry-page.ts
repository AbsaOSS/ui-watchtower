/** Something telemetry can listen to: a page's window, or its document. */
interface UwtListenable<TEvent extends string> {
  addEventListener(type: TEvent, listener: () => void): void;
  removeEventListener(type: TEvent, listener: () => void): void;
}

/**
 * The part of a page telemetry watches: whether it is visible, and its
 * window's `pagehide`. A browser `Document` is one; so is a test double.
 * Typed structurally, so using the engine needs no DOM typings.
 *
 * @group Interfaces
 */
export interface UwtTelemetryDocument extends UwtListenable<'visibilitychange'> {
  readonly visibilityState: string;
  readonly defaultView: UwtListenable<'pagehide'> | null;
}

/**
 * The page to watch: the one given, the global `document` where there is one
 * when none is, and nothing for `null`.
 */
export function uwtTelemetryDocument(
  document: UwtTelemetryDocument | null | undefined
): UwtTelemetryDocument | null {
  return document === undefined ? (globalThis.document ?? null) : document;
}

/**
 * Calls `onPageHide` when the page is going away (`pagehide`) and `onHidden`
 * when it moves to the background (`visibilitychange` to hidden).
 *
 * @param document the page, or `null` to listen to nothing
 * @returns removes both listeners
 */
export function uwtListenToPage(
  document: UwtTelemetryDocument | null,
  onPageHide: () => void,
  onHidden: () => void
): () => void {
  if (!document) {
    return () => undefined;
  }
  const view = document.defaultView;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      onHidden();
    }
  };
  view?.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    view?.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
