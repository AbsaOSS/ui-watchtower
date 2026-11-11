import {
  UwtLoggerName,
  UwtLogLevel,
  UwtLogRecord
} from '../../models/uwt-log.models/uwt-log.models';

/**
 * Filter for reading log records back with `query`.
 *
 * Every field is optional and they combine with AND. A provider translates
 * them however its store requires.
 *
 * @group Interfaces
 */
export interface UwtLogQuery {
  /**
   * Pulls one journey's lines together. Pass a {@link UwtScenario.id} to read
   * everything logged during that scenario, across services.
   */
  correlationId?: string;

  /** Restricts to one named logger. */
  logger?: UwtLoggerName;

  /** Discards records below this severity. */
  minLevel?: UwtLogLevel;

  /** ISO-8601 lower bound on `timestamp`, inclusive. */
  from?: string;

  /** ISO-8601 upper bound on `timestamp`, inclusive. */
  to?: string;

  /** Maximum number of records to return. */
  limit?: number;
}

/**
 * The application's log store, as this library needs to see it.
 *
 * Where records are kept, how they are authorised and how long they are
 * retained are decisions for the consuming application; this is the seam it
 * supplies them through.
 *
 * @example
 * ```typescript
 * send(record: UwtLogRecord): void {
 *   fetch('/api/logs', { method: 'POST', body: JSON.stringify(record) }).catch(
 *     () => undefined
 *   );
 * }
 *
 * async query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
 *   const params = new URLSearchParams(Object.entries(filter).map(([k, v]) => [k, String(v)]));
 *   return (await fetch(`/api/logs?${params}`)).json();
 * }
 * ```
 *
 * @group Interfaces
 */
export interface UwtLogApiProvider {
  /**
   * Ships one record.
   *
   * Called once per record, as it is written. Must be non-blocking and must
   * not throw. A provider that batches accumulates its own queue here and
   * flushes it via {@link flush}.
   *
   * @param record the redacted record
   */
  send(record: UwtLogRecord): void;

  /**
   * Reads records back.
   *
   * @param filter narrows what is returned; an empty filter means "everything
   *   this provider is willing to return"
   * @returns the matching records
   */
  query(filter: UwtLogQuery): Promise<UwtLogRecord[]>;

  /**
   * Ships whatever this provider is holding, if it holds anything.
   *
   * Optional; only needed by a provider that batches in {@link send} instead
   * of sending immediately.
   *
   * Called on `pagehide`, on `visibilitychange` going hidden, and on
   * teardown. Must be synchronous and non-blocking. `fetch` with `keepalive`
   * or `navigator.sendBeacon` are the usual choices.
   */
  flush?(): void;
}
