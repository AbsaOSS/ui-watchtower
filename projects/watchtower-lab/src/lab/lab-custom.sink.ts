import { Injectable } from '@angular/core';
import {
  UwtTelemetryError,
  UwtTelemetryMetadata,
  UwtTelemetrySink,
  uwtClassifyTelemetryEvent
} from '@absaoss-cps/ngx-ui-watchtower';

/**
 * A destination of the lab's own, as an app would write one for its own
 * backend: each event, classified, posted to the mock backend's
 * `/__lab/custom`. With `?destination=custom`.
 */
@Injectable()
export class LabCustomSink extends UwtTelemetrySink {
  private readonly sessionId = crypto.randomUUID();
  private userId?: string;

  /** Run once at startup, by `provideUwtTelemetryDestination`'s `init`. */
  init(): void {
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

  /** Nothing waits: each event is posted as it comes. */
  flush(): void {
    // Nothing to send.
  }

  private post(body: object): void {
    fetch('/__lab/custom', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => undefined);
  }
}
