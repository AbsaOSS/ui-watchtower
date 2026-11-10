import { UwtLogRecord } from '../../models/uwt-log.models/uwt-log.models';
import {
  UwtBroadcastConnection,
  uwtConnectBroadcastChannel,
  uwtIsBroadcastLogRecord,
  uwtIsBroadcastMessage
} from '../../sinks/uwt-broadcast/uwt-broadcast.messages';
import {
  UwtReporter,
  uwtSafeVoid,
  uwtUuid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import {
  UwtLogApiProvider,
  UwtLogQuery
} from '../uwt-log-api.provider/uwt-log-api.provider';

/**
 * How long a follower waits for the host to answer a log query before
 * resolving to `[]`, in milliseconds.
 *
 * @group Utils
 */
export const UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS = 10_000;

/** A log query waiting for the host's answer. */
interface UwtPendingLogQuery {
  resolve: (records: UwtLogRecord[]) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * What {@link UwtBroadcastLogApiProvider} needs; all optional.
 *
 * @group Interfaces
 */
export interface UwtBroadcastLogApiProviderOptions {
  /**
   * The channel's name; must match the host's. Default
   * {@link UWT_DEFAULT_BROADCAST_CHANNEL}.
   */
  channelName?: string;
  /**
   * `false` forwards nothing, and every query resolves to `[]` at once —
   * on a server, or while telemetry is off — even over a shared
   * {@link connection}. Default `true`.
   */
  enabled?: boolean;
  /**
   * A connection to share with the realm's {@link UwtBroadcastTelemetrySink},
   * instead of opening one of its own. Not used while {@link enabled} is
   * `false`. Left open by {@link UwtBroadcastLogApiProvider.dispose}: whoever
   * opened it closes it.
   */
  connection?: UwtBroadcastConnection;
  /**
   * Schedules the query timeout outside the host framework's change
   * detection: Angular passes `NgZone.runOutsideAngular`.
   */
  runOutside?: <T>(callback: () => T) => T;
  /**
   * Hands a query's answer back inside the host framework's change
   * detection: Angular passes `NgZone.run`.
   */
  runInside?: <T>(callback: () => T) => T;
  /** Receives failures; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * Log API provider for a follower realm — the log counterpart of
 * {@link UwtBroadcastTelemetrySink}.
 *
 * Ships nothing itself. Records are forwarded over the `BroadcastChannel`
 * to the realm running a {@link UwtTelemetryBroadcastHost}, which hands
 * them to its own log provider: one log backend, one set of credentials,
 * for the whole composed page.
 *
 * `query()` is answered by the host's provider too. It resolves to `[]`
 * when no host answers within {@link UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS},
 * and at once when no channel could be opened.
 *
 * @group Services
 */
export class UwtBroadcastLogApiProvider implements UwtLogApiProvider {
  private readonly connection: UwtBroadcastConnection;
  private readonly ownsConnection: boolean;
  private readonly stopListening: () => void;
  private readonly runOutside: <T>(callback: () => T) => T;
  private readonly runInside: <T>(callback: () => T) => T;
  private readonly report?: UwtReporter;
  private readonly pending = new Map<string, UwtPendingLogQuery>();
  /** Set by {@link dispose}: nothing is sent or asked after, even on a shared connection. */
  private disposed = false;

  constructor(options: UwtBroadcastLogApiProviderOptions = {}) {
    this.report = options.report;
    // Off wins over a shared connection: this provider then has a closed one
    // of its own, and the shared one stays open for its other users.
    const shared = options.enabled === false ? undefined : options.connection;
    this.ownsConnection = !shared;
    this.connection =
      shared ??
      uwtConnectBroadcastChannel({
        channelName: options.channelName,
        open: options.enabled !== false,
        operation: 'broadcastLogApi',
        report: options.report
      });
    this.runOutside = options.runOutside ?? ((callback) => callback());
    this.runInside = options.runInside ?? ((callback) => callback());
    this.stopListening = this.connection.onMessage((data) =>
      this.onMessage(data)
    );
  }

  /** @inheritdoc */
  send(record: UwtLogRecord): void {
    if (!this.disposed) {
      this.connection.post({ kind: 'log', record });
    }
  }

  /** @inheritdoc */
  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    if (this.disposed || !this.connection.isOpen()) {
      return Promise.resolve([]);
    }

    return new Promise((resolve) => {
      const id = uwtUuid();
      const timer = this.runOutside(() =>
        setTimeout(
          () => this.answer(id, []),
          UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS
        )
      );
      this.pending.set(id, { resolve, timer });
      this.connection.post({ kind: 'log-query', id, filter });
    });
  }

  /** @inheritdoc */
  flush(): void {
    if (!this.disposed) {
      this.connection.post({ kind: 'log-flush' });
    }
  }

  /**
   * Resolves every unanswered query to `[]`, stops listening, and closes
   * the channel if this provider opened it. A shared connection stays open
   * for its other users, but this provider sends nothing over it any more,
   * and every later query resolves to `[]` at once. Calling it again does
   * nothing.
   */
  dispose(): void {
    this.disposed = true;
    for (const id of [...this.pending.keys()]) {
      this.answer(id, []);
    }
    this.stopListening();
    if (this.ownsConnection) {
      this.connection.close();
    }
  }

  private onMessage(data: unknown): void {
    uwtSafeVoid(
      'broadcastLogApi.receive',
      () => {
        if (!uwtIsBroadcastMessage(data) || data.kind !== 'log-query-result') {
          return;
        }
        // Other followers' answers arrive here too; answer() ignores them.
        this.answer(data.id, data.records.filter(uwtIsBroadcastLogRecord));
      },
      this.report
    );
  }

  private answer(id: string, records: UwtLogRecord[]): void {
    const query = this.pending.get(id);
    if (!query) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(query.timer);
    this.runInside(() => query.resolve(records));
  }
}
