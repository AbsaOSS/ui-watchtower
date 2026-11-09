import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
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
import { uwtSafeVoid } from '../uwt-inspector-internal.util/uwt-inspector-internal.util';

/** The window's name, so a second open reuses it rather than adding one. */
export const UWT_INSPECTOR_WINDOW_NAME = 'ngx-ui-watchtower-event-inspector';

const STYLES = 'style, link[rel~="stylesheet"], base';

export interface UwtInspectorWindowOptions {
  /** The app's document. */
  document: Document;
  environment: EnvironmentInjector;
  appRef: ApplicationRef;
  title: string;
  /** Where the window was last, if anywhere. */
  geometry?: UwtInspectorWindowGeometry;
  /** The user closed the window. */
  onClosed: () => void;
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
    UWT_INSPECTOR_WINDOW_NAME,
    features(view, options.geometry)
  );
  if (!view || !popup) {
    return undefined;
  }

  const doc = popup.document;
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
      { provide: CPS_LIVE_ANNOUNCER_SERVICE, useClass: CpsLiveAnnouncerService }
    ],
    options.environment
  );
  const ref = createComponent(UwtInspectorComponent, {
    environmentInjector: environment,
    hostElement: element
  });
  ref.setInput('dock', 'window');
  options.appRef.attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();

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
  const onPageHide = () => {
    saveGeometry();
    options.onClosed();
  };
  const closeWithApp = () => popup.close();
  popup.addEventListener('pagehide', onPageHide);
  view.addEventListener('pagehide', closeWithApp);
  doc.addEventListener('keydown', options.onKeydown, true);

  return {
    dock: 'window',
    focus: () => {
      popup.focus();
      ref.instance.focusInspector();
    },
    containsFocus: () => doc.hasFocus(),
    destroy: () => {
      popup.removeEventListener('pagehide', onPageHide);
      view.removeEventListener('pagehide', closeWithApp);
      doc.removeEventListener('keydown', options.onKeydown, true);
      uwtSafeVoid('window.geometry', saveGeometry);
      stopMirroring();
      // Destroying the view detaches it from the app, unless the app, being
      // destroyed, already has: detaching it here would warn (NG0406).
      ref.destroy();
      environment.destroy();
      popup.close();
    }
  };
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
