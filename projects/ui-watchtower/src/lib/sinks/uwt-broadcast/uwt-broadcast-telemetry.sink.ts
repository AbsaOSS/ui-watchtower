import { UwtTelemetryIdentity } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import {
  UwtTelemetryError,
  UwtTelemetryMetadata
} from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import {
  UwtReporter,
  uwtSafeVoid
} from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { UwtTelemetrySink } from '../uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import {
  UwtBroadcastConnection,
  uwtConnectBroadcastChannel,
  uwtIsBroadcastMessage
} from './uwt-broadcast.messages';

/**
 * What {@link UwtBroadcastTelemetrySink} needs.
 *
 * @group Interfaces
 */
export interface UwtBroadcastTelemetrySinkOptions {
  /** This realm's identity, stamped onto everything it forwards. */
  identity: UwtTelemetryIdentity;
  /**
   * The channel's name; must match the host's. Default
   * {@link UWT_DEFAULT_BROADCAST_CHANNEL}.
   */
  channelName?: string;
  /**
   * `false` forwards nothing — on a server, or while telemetry is off —
   * even over a shared {@link connection}. Default `true`.
   */
  enabled?: boolean;
  /**
   * A connection to share with the realm's
   * {@link UwtBroadcastLogApiProvider}, instead of opening one of its own.
   * Not used while {@link enabled} is `false`. Left open by
   * {@link UwtBroadcastTelemetrySink.dispose}: whoever opened it closes it.
   */
  connection?: UwtBroadcastConnection;
  /** Receives failures; see {@link UwtReporter}. */
  report?: UwtReporter;
}

/**
 * Telemetry sink for a follower realm — a micro-frontend fragment, a webview
 * panel, any context with its own JavaScript realm but the same origin.
 *
 * Creates no AWS client of its own. Events are forwarded over a
 * `BroadcastChannel` to the realm running a {@link UwtTelemetryBroadcastHost},
 * which records them through the one real sink. Application code sees no
 * difference — it uses the same engine and calls the same methods.
 *
 * @group Services
 */
export class UwtBroadcastTelemetrySink extends UwtTelemetrySink {
  private readonly connection: UwtBroadcastConnection;
  private readonly ownsConnection: boolean;
  private readonly stopListening: () => void;
  private readonly report?: UwtReporter;

  /** The host's session id, once it has answered. */
  private sessionId?: string;
  private userId?: string;

  /**
   * This realm's own identity, stamped onto everything it forwards.
   *
   * The host records through its own RUM client, so without this, forwarded
   * events would all be labelled as the host's realm.
   */
  private readonly origin: {
    application: string;
    environment: string;
    appVersion: string;
  };

  constructor(options: UwtBroadcastTelemetrySinkOptions) {
    super();
    this.report = options.report;
    // Off wins over a shared connection: this sink then has a closed one of
    // its own, and the shared one stays open for its other users.
    const shared = options.enabled === false ? undefined : options.connection;
    this.ownsConnection = !shared;
    this.connection =
      shared ??
      uwtConnectBroadcastChannel({
        channelName: options.channelName,
        open: options.enabled !== false,
        operation: 'broadcastSink',
        report: options.report
      });
    this.origin = {
      application: options.identity.application,
      environment: options.identity.environment,
      appVersion: options.identity.version
    };

    this.stopListening = this.connection.onMessage((data) =>
      this.onMessage(data)
    );
    this.connection.post({ kind: 'identity-request' });
  }

  /** @inheritdoc */
  record(
    eventType: string,
    payload: object,
    metadata?: UwtTelemetryMetadata
  ): void {
    this.connection.post({
      kind: 'event',
      eventType,
      payload,
      metadata: { ...metadata, ...this.origin }
    });
  }

  /** @inheritdoc */
  recordError(error: UwtTelemetryError, metadata?: UwtTelemetryMetadata): void {
    this.connection.post({
      kind: 'error',
      error,
      metadata: { ...metadata, ...this.origin }
    });
  }

  /**
   * The host's session id.
   *
   * Returns `undefined` until the host answers.
   *
   * @returns the shared session id, when known
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** @inheritdoc */
  setUserId(userId: string | undefined): void {
    this.userId = userId;
    this.connection.post({ kind: 'user', userId });
  }

  /** @inheritdoc */
  getUserId(): string | undefined {
    return this.userId;
  }

  /** @inheritdoc */
  flush(beacon = false): void {
    this.connection.post({ kind: 'flush', beacon });
  }

  /**
   * Stops listening, and closes the channel if this sink opened it. Calling
   * it again does nothing.
   */
  dispose(): void {
    this.stopListening();
    if (this.ownsConnection) {
      this.connection.close();
    }
  }

  private onMessage(data: unknown): void {
    uwtSafeVoid(
      'broadcastSink.receive',
      () => {
        if (!uwtIsBroadcastMessage(data) || data.kind !== 'identity') {
          return;
        }
        this.sessionId = data.sessionId;
        this.userId = data.userId;
      },
      this.report
    );
  }
}
