import { DOCUMENT, inject, Injectable } from '@angular/core';
import {
  UwtTelemetryError,
  UwtTelemetryMetadata,
  UwtTelemetrySink,
  uwtClassifyTelemetryEvent,
  uwtMarkSessionStart,
  uwtUuid
} from '@absaoss-cps/ngx-ui-watchtower';
import { labSentOnServer } from './lab-server-sends';

/**
 * A destination of the lab's own, as an app would write one for its own
 * backend: each event, classified, posted to the mock backend's
 * `/__lab/custom`. With `?destination=custom`.
 *
 * Events wait for the end of the task, then go together. As the page goes,
 * the library records what is left and calls `flush(true)` straight after:
 * those go by beacon, which outlives the page where a fetch is cancelled.
 */
@Injectable()
export class LabCustomSink extends UwtTelemetrySink {
  private readonly document = inject(DOCUMENT);
  /** One session per page load: it starts now, for `sessionElapsed`. */
  private readonly sessionId = uwtUuid();
  private userId?: string;
  private queue: object[] = [];

  /** Run once at startup, by `provideUwtTelemetryDestination`'s `init`. */
  init(): void {
    uwtMarkSessionStart(this.sessionId);
    this.post({ kind: 'init' });
  }

  record(
    eventType: string,
    payload: object,
    metadata?: UwtTelemetryMetadata
  ): void {
    const { kind } = uwtClassifyTelemetryEvent(eventType, payload);
    this.post({ kind, eventType, payload, metadata });
  }

  recordError(error: UwtTelemetryError, metadata?: UwtTelemetryMetadata): void {
    this.post({ kind: 'error', error, metadata });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setUserId(userId: string | undefined): void {
    this.userId = userId || undefined;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  flush(beacon = false): void {
    if (this.queue.length === 0) {
      return;
    }
    const json = JSON.stringify(this.queue);
    this.queue = [];
    if (labSentOnServer('POST /__lab/custom')) {
      return;
    }
    const sent =
      beacon &&
      this.document.defaultView?.navigator.sendBeacon('/__lab/custom', json);
    if (!sent) {
      fetch('/__lab/custom', { method: 'POST', body: json }).catch(
        () => undefined
      );
    }
  }

  private post(event: object): void {
    if (this.queue.push(event) === 1) {
      queueMicrotask(() => this.flush());
    }
  }
}
