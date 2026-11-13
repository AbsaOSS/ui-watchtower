import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  createEnvironmentInjector,
  EnvironmentInjector
} from '@angular/core';
import {
  CPS_LIVE_ANNOUNCER_SERVICE,
  CpsLiveAnnouncerService,
  CpsNotificationService
} from 'cps-ui-kit';
import { UwtInspectorComponent } from '../uwt-inspector/uwt-inspector.component';
import { UwtInspectorHost } from '../uwt-inspector-session/uwt-inspector-session';
import { UwtInspectorWindowGeometry } from '../uwt-inspector-preferences/uwt-inspector-preferences';
import {
  uwtSafe,
  uwtSafeVoid
} from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/** The window's name, so a second open reuses it rather than adding one. */
export const UWT_INSPECTOR_WINDOW_NAME = 'ngx-ui-watchtower-event-inspector';

/**
 * The window's name for an app: its own, so apps sharing a page — a shell
 * and its fragments — don't take over each other's window.
 */
export function uwtInspectorWindowName(application?: string): string {
  return application
    ? `${UWT_INSPECTOR_WINDOW_NAME}:${application}`
    : UWT_INSPECTOR_WINDOW_NAME;
}

const STYLES = 'style, link[rel~="stylesheet"], base';

/**
 * A window's page hides when the window closes, and when it reloads. Which it
 * was is seen a moment later: a window that is still there, with a new
 * document, was reloaded. The wait is bounded; a window that has neither
 * closed nor come back in that time is treated as closed.
 */
const SETTLE_EVERY_MS = 50;
const SETTLE_TRIES = 20;

export interface UwtInspectorWindowOptions {
  /** The app's document. */
  document: Document;
  environment: EnvironmentInjector;
  appRef: ApplicationRef;
  title: string;
  /** The window's name; {@link UWT_INSPECTOR_WINDOW_NAME} by default. */
  name?: string;
  /** Where the window was last, if anywhere. */
  geometry?: UwtInspectorWindowGeometry;
  /** The user closed the window. */
  onClosed: () => void;
  /**
   * The user reloaded the window: as closing it and opening it again, so
   * the inspector drawn in its new document starts afresh.
   */
  onReloaded: () => void;
  /** Every key pressed in the window, for the shortcut. */
  onKeydown: (event: KeyboardEvent) => void;
  /** The window's size and position, as it closes. */
  onGeometry: (geometry: UwtInspectorWindowGeometry) => void;
}

/**
 * Shows the inspector in its own browser window, rendered by this app into
 * the window's document. The window gets the app's styles, kept in step as
 * Angular adds more, and its own `DOCUMENT`, notifications and screen
 * reader announcer, so cps-ui-kit's tooltips, menus and messages appear in
 * it rather than in the app.
 *
 * Must run during a click or key press, or the browser blocks the window.
 *
 * @returns the host, or `undefined` when the browser blocked the window
 */
export function uwtOpenInspectorWindow(
  options: UwtInspectorWindowOptions
): UwtInspectorHost | undefined {
  const view = options.document.defaultView;
  const popup = view?.open(
    '',
    options.name ?? UWT_INSPECTOR_WINDOW_NAME,
    features(view, options.geometry)
  );
  if (!view || !popup) {
    return undefined;
  }

  /** The inspector, drawn into one document of the window: a reload gives it another. */
  interface Mounted {
    doc: Document;
    ref: ComponentRef<UwtInspectorComponent>;
    environment: EnvironmentInjector;
    stopMirroring: () => void;
  }

  const mount = (doc: Document): Mounted => {
    // A window left over from before the app reloaded holds stale content.
    doc.head.replaceChildren();
    doc.body.replaceChildren();
    doc.title = options.title;
    doc.body.style.margin = '0';
    const stopMirroring = mirrorStyles(options.document, doc);

    const element = doc.body.appendChild(doc.createElement('div'));
    element.style.height = '100vh';
    const environment = createEnvironmentInjector(
      [
        { provide: DOCUMENT, useValue: doc },
        CpsNotificationService,
        {
          provide: CPS_LIVE_ANNOUNCER_SERVICE,
          useClass: CpsLiveAnnouncerService
        }
      ],
      options.environment
    );
    let created: ComponentRef<UwtInspectorComponent> | undefined;
    try {
      created = createComponent(UwtInspectorComponent, {
        environmentInjector: environment,
        hostElement: element
      });
      created.setInput('dock', 'window');
      options.appRef.attachView(created.hostView);
      created.changeDetectorRef.detectChanges();
      setIcon(doc);
    } catch (error) {
      created?.destroy();
      environment.destroy();
      stopMirroring();
      throw error;
    }
    doc.addEventListener('keydown', options.onKeydown, true);
    return { doc, ref: created, environment, stopMirroring };
  };

  const unmount = (mounted: Mounted) => {
    mounted.doc.removeEventListener('keydown', options.onKeydown, true);
    mounted.stopMirroring();
    // Destroying the view detaches it from the app, unless the app, being
    // destroyed, already has: detaching it here would warn (NG0406).
    mounted.ref.destroy();
    mounted.environment.destroy();
  };

  let current: Mounted | undefined;
  try {
    current = mount(popup.document);
  } catch (error) {
    // Half open: close it again, for the caller to open a dialog instead.
    popup.close();
    throw error;
  }

  let saved = false;
  const saveGeometry = () => {
    if (!saved) {
      saved = true;
      options.onGeometry({
        width: popup.innerWidth,
        height: popup.innerHeight,
        left: popup.screenX,
        top: popup.screenY
      });
    }
  };

  let settling: ReturnType<typeof setTimeout> | undefined;
  /** Closed, or reloaded: a reload gets the inspector drawn afresh in its new document. */
  const settle = (triesLeft: number) => {
    settling = undefined;
    if (popup.closed) {
      options.onClosed();
      return;
    }
    const next = uwtSafe('window.document', () => popup.document, undefined);
    if (next?.body && next !== current?.doc) {
      if (current) {
        unmount(current);
        current = undefined;
      }
      try {
        // Between the old view and the new: neither holds the history then.
        options.onReloaded();
        current = mount(next);
        // Its size is saved again when it next closes.
        saved = false;
        popup.addEventListener('pagehide', onPageHide);
      } catch {
        options.onClosed();
      }
    } else if (triesLeft > 0) {
      settling = setTimeout(() => settle(triesLeft - 1), SETTLE_EVERY_MS);
    } else {
      options.onClosed();
    }
  };
  const onPageHide = () => {
    // The size is gone once the window is, so it is taken now.
    saveGeometry();
    settling ??= setTimeout(() => settle(SETTLE_TRIES), SETTLE_EVERY_MS);
  };
  const closeWithApp = () => popup.close();
  popup.addEventListener('pagehide', onPageHide);
  view.addEventListener('pagehide', closeWithApp);

  return {
    dock: 'window',
    focus: () => {
      popup.focus();
      current?.ref.instance.focusInspector();
    },
    containsFocus: () => current?.doc.hasFocus() ?? false,
    destroy: () => {
      clearTimeout(settling);
      settling = undefined;
      popup.removeEventListener('pagehide', onPageHide);
      view.removeEventListener('pagehide', closeWithApp);
      uwtSafeVoid('window.geometry', saveGeometry);
      if (current) {
        unmount(current);
        current = undefined;
      }
      popup.close();
    }
  };
}

/**
 * Gives the window the inspector's own mark as its icon, taken from the logo
 * it drew: an app's icon, if any, would say nothing about this window, and a
 * library can't count on serving a file.
 */
function setIcon(doc: Document): void {
  const logo = doc.querySelector('uwt-inspector-logo svg');
  if (logo) {
    const link = doc.head.appendChild(doc.createElement('link'));
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(logo))}`;
  }
}

/** 1200×800 at most the screen the first time, then where it was last. */
function features(view: Window, geometry?: UwtInspectorWindowGeometry): string {
  const width = Math.min(geometry?.width ?? 1200, view.screen.availWidth);
  const height = Math.min(geometry?.height ?? 800, view.screen.availHeight);
  const position = geometry ? `,left=${geometry.left},top=${geometry.top}` : '';
  return `popup,width=${width},height=${height}${position}`;
}

/**
 * Copies the app's stylesheets into the window, then keeps adding and
 * removing copies as the app's `<head>` changes — Angular adds a
 * component's styles only when it first renders.
 */
function mirrorStyles(from: Document, to: Document): () => void {
  const copies = new Map<Node, Element>();
  const add = (node: Node) => {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).matches(STYLES)
    ) {
      const copy = to.importNode(node as Element, true);
      copies.set(node, copy);
      to.head.appendChild(copy);
    }
  };
  from.head.childNodes.forEach(add);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(add);
      record.removedNodes.forEach((node) => {
        copies.get(node)?.remove();
        copies.delete(node);
      });
    }
  });
  observer.observe(from.head, { childList: true });
  return () => observer.disconnect();
}
