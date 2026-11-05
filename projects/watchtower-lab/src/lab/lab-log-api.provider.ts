import { DOCUMENT, inject, Injectable } from '@angular/core';
import {
  UwtLogApiProvider,
  UwtLogQuery,
  UwtLogRecord
} from '@absaoss-cps/ngx-ui-watchtower';
import { LAB_OPTIONS } from './lab-options';

/**
 * Sends log records to the lab's mock backend, as the README's example does:
 * each at once, or — with the `lab.logBatching` setting — in batches, sent
 * every 10 seconds and whenever the library calls `flush()`, as the page is
 * hidden or closes.
 */
@Injectable({ providedIn: 'root' })
export class LabLogApiProvider implements UwtLogApiProvider {
  private readonly document = inject(DOCUMENT);
  private readonly batching =
    inject(LAB_OPTIONS, { optional: true })?.config.lab?.logBatching ?? false;

  private pending: UwtLogRecord[] = [];
  private timer?: ReturnType<typeof setTimeout>;

  send(record: UwtLogRecord): void {
    if (!this.batching) {
      this.post([record]);
      return;
    }
    this.pending.push(record);
    this.timer ??= setTimeout(() => this.flush(), 10_000);
  }

  /**
   * Called by the library as the page is hidden or goes away. Kept alive
   * either way: WebKit still says `visible` while a reloading page hides, and
   * cancels a plain request then.
   */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.length > 0) {
      this.post(this.pending, true);
      this.pending = [];
    }
  }

  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    const params = new URLSearchParams(
      Object.entries(filter)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)])
    );
    return fetch(`/api/logs?${params}`).then((r) => r.json());
  }

  private post(records: UwtLogRecord[], closing = false): void {
    fetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify(records),
      // Only while the page may be closing: browsers reject keepalive
      // requests once all in flight exceed 64 KiB.
      keepalive: closing || this.document.visibilityState === 'hidden'
    }).catch(() => undefined);
  }
}
