import { DOCUMENT, inject, Injectable } from '@angular/core';
import {
  UwtLogApiProvider,
  UwtLogQuery,
  UwtLogRecord
} from '@absaoss-cps/ngx-ui-watchtower';

/** Sends log records to the lab's mock backend, as the README's example does. */
@Injectable({ providedIn: 'root' })
export class LabLogApiProvider implements UwtLogApiProvider {
  private readonly document = inject(DOCUMENT);

  send(record: UwtLogRecord): void {
    fetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify(record),
      // Only while the page is hidden (it may be closing): browsers reject
      // keepalive requests once all in flight exceed 64 KiB.
      keepalive: this.document.visibilityState === 'hidden'
    }).catch(() => undefined);
  }

  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    const params = new URLSearchParams(
      Object.entries(filter)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    );
    return fetch(`/api/logs?${params}`).then((r) => r.json());
  }
}
