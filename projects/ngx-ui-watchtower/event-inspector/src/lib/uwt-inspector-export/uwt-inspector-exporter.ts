import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import {
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower';
import { CPS_LIVE_ANNOUNCER_SERVICE, CpsNotificationService } from 'cps-ui-kit';
import {
  UwtInspectorKindFilter,
  UwtInspectorSectionId
} from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorStore } from '../uwt-inspector-store/uwt-inspector-store';
import {
  uwtBuildInspectorExport,
  uwtInspectorFilename,
  uwtDownloadJson,
  uwtSafeStringify
} from './uwt-inspector-export';

/** What each kind calls its events, when telling people about them. */
export const UWT_INSPECTOR_SECTION_NOUN: Record<UwtInspectorSectionId, string> =
  { bi: 'BI', scenario: 'scenario', logging: 'log' };

/** `events`, or `BI events`: what an export of `kind` holds. */
export function uwtInspectorEventsNoun(kind: UwtInspectorKindFilter): string {
  return kind === 'all'
    ? 'events'
    : `${UWT_INSPECTOR_SECTION_NOUN[kind]} events`;
}

/** `1 BI event`, `3 events`: a number of a kind's events. */
export function uwtInspectorEventCount(
  count: number,
  kind: UwtInspectorKindFilter
): string {
  const noun = uwtInspectorEventsNoun(kind);
  return `${count} ${count === 1 ? noun.slice(0, -1) : noun}`;
}

/**
 * Downloads or copies the captured events of a kind, or of every kind, as
 * JSON. Provided by the popup, beside its {@link UwtInspectorStore}.
 */
@Injectable()
export class UwtInspectorExporter {
  private readonly store = inject(UwtInspectorStore);
  private readonly identity = inject(UWT_TELEMETRY_IDENTITY, {
    optional: true
  });

  private readonly sink = inject(UwtTelemetrySink, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly announcer = inject(CPS_LIVE_ANNOUNCER_SERVICE, {
    optional: true
  });

  private readonly notifications = inject(CpsNotificationService, {
    optional: true
  });

  /** Saves the kind's events as a JSON file. */
  download(kind: UwtInspectorKindFilter): void {
    try {
      const json = this.json(kind);
      uwtDownloadJson(
        this.document,
        uwtInspectorFilename(
          this.identity?.application ?? 'app',
          kind,
          new Date()
        ),
        json
      );
      this.announce(
        `Downloaded ${uwtInspectorEventCount(this.store.count(kind).captured, kind)}.`
      );
    } catch (error) {
      this.fail("Couldn't create the download", error);
    }
  }

  /**
   * Puts the kind's events on the clipboard, for when a browser blocks
   * downloads.
   *
   * @returns whether copying worked
   */
  async copy(kind: UwtInspectorKindFilter): Promise<boolean> {
    try {
      // The inspector's own window: in a separate window, the app's
      // clipboard refuses, as the app's page doesn't have focus.
      const view = this.document.defaultView ?? window;
      await view.navigator.clipboard.writeText(this.json(kind));
      this.announce(
        `${uwtInspectorEventCount(this.store.count(kind).captured, kind)} copied as JSON.`
      );
      return true;
    } catch (error) {
      this.fail("Couldn't copy to the clipboard", error);
      return false;
    }
  }

  /** The kind's export document, serialized. */
  json(kind: UwtInspectorKindFilter): string {
    return uwtSafeStringify(
      uwtBuildInspectorExport(this.store.events(kind), {
        section: kind,
        startedAt: this.store.startedAt(),
        paused: this.store.paused(),
        app: {
          application: this.identity?.application ?? '',
          environment: this.identity?.environment ?? '',
          version: this.identity?.version ?? '',
          eventNamespace:
            this.identity?.eventNamespace ?? UWT_DEFAULT_EVENT_NAMESPACE
        },
        session: this.session(),
        userAgent: this.document.defaultView?.navigator.userAgent ?? '',
        activeFilters: this.store.filters(),
        count: this.store.count(kind)
      }),
      2
    );
  }

  private session(): { sessionId?: string; userId?: string } {
    try {
      return {
        sessionId: this.sink?.getSessionId(),
        userId: this.sink?.getUserId()
      };
    } catch {
      return {};
    }
  }

  private announce(message: string): void {
    try {
      this.announcer?.announce(message, 'polite');
    } catch {
      // Announcements are a courtesy; never let one break the popup.
    }
  }

  private fail(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    try {
      this.notifications?.error(message, detail);
    } catch {
      // Nothing more to do; the popup keeps working.
    }
  }
}
