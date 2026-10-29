import { DOCUMENT } from '@angular/common';
import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import type { AwsRum, AwsRumConfig } from 'aws-rum-web';
import {
  UWT_REDACT_CONFIG,
  UWT_TELEMETRY_ENABLED,
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetryError,
  UwtTelemetryMetadata,
  UwtTelemetrySink,
  uwtNormalizeError
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  uwtIsBrowser,
  uwtIsDevMode,
  uwtSafe,
  uwtSafeVoid,
  uwtUuid
} from '../uwt-rum-internal.util/uwt-rum-internal.util';
import {
  UWT_RUM_CREDENTIALS_PROVIDER,
  UwtRumBootstrap,
  UwtRumCredentials
} from '../uwt-rum-credentials/uwt-rum-credentials';

/** Refresh credentials this long before they expire. */
const CREDENTIAL_REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Maximum delay supported by setTimeout (2^31 - 1 ms, ~24.85 days).
 * Prevents 32-bit signed integer overflow triggering an immediate execution.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Retry delay after a scheduled refresh fails or returns no credentials.
 * Shorter than the normal refresh-ahead-of-expiry interval.
 */
const CREDENTIAL_RETRY_DELAY_MS = 30 * 1000;

/**
 * Startup retries wait a random time up to a limit that starts at
 * {@link INIT_RETRY_BASE_MS} and doubles after each failure, up to
 * {@link INIT_RETRY_MAX_MS}. The first retry comes fast, because the client
 * captures nothing until it exists; the randomness keeps tabs reloaded
 * together from retrying together.
 */
const INIT_RETRY_BASE_MS = 1000;
const INIT_RETRY_MAX_MS = 60 * 1000;

/**
 * How long startup keeps retrying before the sink gives up and runs the page
 * without RUM. Bounds the retries when the failure is permanent, such as a
 * wrong URL or a 403.
 */
const INIT_RETRY_WINDOW_MS = 5 * 60 * 1000;

/**
 * Events retained while the SDK loads. Bounded so a failed init cannot
 * grow the buffer without limit.
 */
const PRE_INIT_BUFFER_LIMIT = 100;

/** Metadata keys under this prefix are reserved by the RUM client. */
const RESERVED_PREFIX = 'aws:';

interface BufferedEvent {
  kind: 'event';
  eventType: string;
  payload: object;
  metadata?: UwtTelemetryMetadata;
}

interface BufferedPageView {
  kind: 'pageView';
  pageId: string;
}

interface BufferedError {
  kind: 'error';
  error: UwtTelemetryError;
  metadata?: UwtTelemetryMetadata;
}

/** Anything the pre-init buffer holds. */
type BufferedItem = BufferedEvent | BufferedPageView | BufferedError;

/**
 * Drops every key whose value is `undefined`.
 *
 * Used to build the SDK config object from optional consumer fields: a key
 * present with value `undefined` would overwrite the SDK's own default for
 * that key, so unset fields must be absent rather than `undefined`.
 */
function omitUndefined<T extends object>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Telemetry sink backed by the AWS CloudWatch RUM web client.
 *
 * Custom scenario and BI events travel through `recordEvent`, alongside the
 * page views, web vitals, JS errors, HTTP failures and resource timing the
 * client records on its own. The SDK is imported lazily, so an application
 * that never provides this sink never pays for the bundle. Every operation
 * is fail-open: if the broker is down, credentials lapse, or the SDK
 * throws, the application behaves as if RUM were healthy.
 *
 * @group Services
 */
@Injectable()
export class UwtRumTelemetrySink extends UwtTelemetrySink implements OnDestroy {
  private readonly config = inject(UWT_TELEMETRY_IDENTITY);
  private readonly redact = inject(UWT_REDACT_CONFIG);
  private readonly credentialsProvider = inject(UWT_RUM_CREDENTIALS_PROVIDER);
  private readonly document = inject(DOCUMENT);
  /**
   * False on the server and while telemetry is off: the client never starts —
   * no credentials fetch, no SDK import — and every call is a no-op.
   */
  private readonly canStart =
    uwtIsBrowser() &&
    (inject(UWT_TELEMETRY_ENABLED, { optional: true }) ?? true);

  private readonly zone = inject(NgZone, { optional: true });

  private awsRum: AwsRum | null = null;
  /**
   * The pending broker call: a startup retry before the client exists, the
   * next credential refresh after.
   */
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private buffer: BufferedItem[] = [];
  private userId?: string;
  /**
   * Set once the app has called `setUserId`. Until then, the client's id may
   * be a signed-in user's, restored from its cookie after a reload, so
   * events carry no `signedIn`.
   */
  private userKnown = false;
  /** A sign-out arrived before the client existed; applied once it starts. */
  private signOutPending = false;
  /**
   * Set once RUM is off for the page — the broker declined, startup gave up,
   * or a refresh returned null; distinct from `!awsRum` alone.
   */
  private disabled = false;
  /** Broker requests that failed at startup so far. */
  private initFailures = 0;
  /** When the first of them failed. */
  private initFailedAt?: number;
  /**
   * The current startup attempt, shared by every caller —
   * `provideUwtTelemetryRumSink()`'s `APP_INITIALIZER`,
   * {@link ensureInitialized}, and a caller awaiting `init()` directly. A
   * retry replaces it, so awaiting `init()` waits for one attempt, not for
   * RUM to be running.
   */
  private initPromise?: Promise<void>;
  /**
   * Set once in `ngOnDestroy`. `refreshCredentials()` nulls `refreshTimer`
   * before its own `await`, so a destroy during that window would leave a
   * new timer nothing could clear. Checked after every await in the
   * refresh chain instead.
   */
  private destroyed = false;

  /**
   * Loads and starts the RUM client.
   *
   * Fire-and-forget: it must never block bootstrap and never reject into the
   * caller. Safe to call more than once; subsequent calls are no-ops.
   *
   * @returns a promise that resolves once initialization has been attempted
   */
  async init(): Promise<void> {
    if (!this.canStart) {
      return;
    }
    if (!this.initPromise) {
      // Outside Angular's zone: the SDK's dispatch interval and this sink's
      // retry and refresh timers would otherwise keep a zone-based app from
      // ever becoming stable.
      this.initPromise = this.zone
        ? this.zone.runOutsideAngular(() => this.performInit())
        : this.performInit();
    }
    return this.initPromise;
  }

  private async performInit(): Promise<void> {
    let bootstrap: UwtRumBootstrap | null;
    try {
      bootstrap = await this.credentialsProvider.load();
    } catch (error) {
      this.retryInit(error);
      return;
    }

    try {
      if (!bootstrap?.config) {
        this.disableAwsRum();
        this.buffer = [];
        return;
      }

      // Not retried if this fails: with native ES modules (Angular's default
      // build) the browser remembers a failed dynamic import for the page.
      const { AwsRum } = await import('aws-rum-web');
      if (this.destroyed) {
        return;
      }

      this.awsRum = new AwsRum(
        bootstrap.config.applicationId,
        bootstrap.config.applicationVersion,
        bootstrap.config.region,
        this.buildRumConfig(bootstrap)
      );

      this.applyIdentity();
      this.applyCredentials(bootstrap.credentials);
      this.replayBuffer();
    } catch (error) {
      this.disableAwsRum();
      this.buffer = [];
      this.reportFailure('RUM init failed, monitoring disabled', error);
    }
  }

  /**
   * After a failed broker request at startup: tries again later, keeping
   * events buffered — the failure is usually a passing network or broker
   * problem. Gives up after {@link INIT_RETRY_WINDOW_MS}.
   */
  private retryInit(error: unknown): void {
    if (this.destroyed) {
      return;
    }

    this.initFailures++;
    this.initFailedAt ??= Date.now();
    if (Date.now() - this.initFailedAt >= INIT_RETRY_WINDOW_MS) {
      this.disableAwsRum();
      this.buffer = [];
      this.reportFailure('RUM init failed, monitoring disabled', error);
      return;
    }

    if (this.initFailures === 1) {
      this.reportFailure('RUM init failed, retrying', error);
    }
    const limit = Math.min(
      INIT_RETRY_BASE_MS * 2 ** (this.initFailures - 1),
      INIT_RETRY_MAX_MS
    );
    this.scheduleRetry(() => {
      this.initPromise = this.performInit();
      return this.initPromise;
    }, Math.random() * limit);
  }

  /**
   * Kicks off `init()` on first real use, for a sink bound directly (e.g.
   * `{ provide: UwtTelemetrySink, useClass: UwtRumTelemetrySink }`) rather
   * than through `provideUwtTelemetryRumSink()`, which is what normally
   * calls `init()` via `APP_INITIALIZER`. `init()` is idempotent and
   * memoized, so this is a no-op once already initialized or already in
   * flight, and never races with a caller awaiting `init()` directly.
   */
  private ensureInitialized(): void {
    if (!this.initPromise) {
      this.init().catch(() => undefined);
    }
  }

  /**
   * Shared shape behind {@link record}, {@link recordError} and
   * {@link recordPageView}: kicks off init, then either buffers `item`
   * (pre-init) or hands the live client to `dispatch`, all inside the same
   * fail-open guard.
   */
  private recordOrBuffer(
    operation: string,
    item: BufferedItem,
    dispatch: (awsRum: AwsRum) => void
  ): void {
    this.ensureInitialized();
    uwtSafeVoid(operation, () => {
      if (!this.canStart || this.disabled) {
        return;
      }

      const awsRum = this.awsRum;
      if (!awsRum) {
        this.bufferItem(item);
        return;
      }

      dispatch(awsRum);
    });
  }

  /** @inheritdoc */
  record(
    eventType: string,
    payload: object,
    metadata?: UwtTelemetryMetadata
  ): void {
    this.recordOrBuffer(
      'rum.record',
      { kind: 'event', eventType, payload, metadata },
      (awsRum) =>
        awsRum.recordEvent(eventType, payload, this.sanitize(metadata))
    );
  }

  /** @inheritdoc */
  recordError(error: UwtTelemetryError, metadata?: UwtTelemetryMetadata): void {
    this.recordOrBuffer(
      'rum.recordError',
      { kind: 'error', error, metadata },
      (awsRum) => awsRum.recordError(this.withOrigin(error, metadata))
    );
  }

  /** @inheritdoc */
  getSessionId(): string | undefined {
    return uwtSafe(
      'rum.getSessionId',
      () => this.awsRum?.getSessionId(),
      undefined
    );
  }

  /**
   * Associates subsequent events with a user, or with nobody.
   *
   * Signing in pins the id, and works even before `init()` resolves.
   * Signing out starts a fresh session with a new anonymous id (`pinUserId`
   * has no inverse), which emits a `session_start` event and re-rolls
   * sampling. Before `init()` resolves, a sign-out is applied once the
   * client starts. Signing out while nobody is signed in does nothing.
   *
   * Every event carries `signedIn` in its metadata, so a signed-in user's id
   * can be told from an anonymous one. It is absent until the first call,
   * so call this as early as possible, e.g. right after the auth library
   * initializes.
   *
   * @param userId the application's own user identifier, or `undefined`
   * (or `''`) on sign-out. RUM accepts only a UUID, e.g. MSAL's
   * `localAccountId`.
   */
  setUserId(userId: string | undefined): void {
    uwtSafeVoid('rum.setUserId', () => {
      const previous = this.userId;
      this.userId = userId;
      this.userKnown = true;

      const awsRum = this.awsRum;
      if (!awsRum) {
        // A sign-in is pinned, a sign-out applied, once the client starts.
        if (userId || previous) {
          this.signOutPending = !userId;
        }
        return;
      }

      if (userId && userId !== previous) {
        // The client reads the user id when it sends a batch, not when it
        // records an event, so what's waiting goes first, under the old id —
        // unless the client already has this one, as after a reload.
        if (awsRum.getUserId() !== userId) {
          awsRum.dispatch();
        }
        awsRum.pinUserId(userId);
      } else if (!userId && previous) {
        awsRum.dispatch();
        awsRum.startSession({ userId: uwtUuid() });
      }
    });
  }

  /** @inheritdoc */
  getUserId(): string | undefined {
    return this.userId;
  }

  /** @inheritdoc */
  flush(beacon = false): void {
    uwtSafeVoid('rum.flush', () => {
      if (!this.awsRum) {
        if (this.buffer.length > 0 && uwtIsDevMode()) {
          console.warn(
            `[ngx-ui-watchtower] ${this.buffer.length} RUM event(s) lost: page unloaded before RUM finished initializing`
          );
        }
        return;
      }

      if (beacon) {
        this.awsRum.dispatchBeacon();
      } else {
        this.awsRum.dispatch();
      }
    });
  }

  /**
   * Records a page view.
   *
   * The RUM client already records a page view on every navigation via
   * `history.pushState`, covering Angular's router automatically. Use this
   * to report a different page id (e.g. a route template instead of the
   * resolved URL); also set `disableAutoPageView: true` in the RUM config
   * to avoid recording the navigation twice. Buffered like {@link record}
   * when called before `init()` resolves.
   *
   * @param pageId the page identity, e.g. `/customers/:id`
   */
  recordPageView(pageId: string): void {
    this.recordOrBuffer(
      'rum.recordPageView',
      { kind: 'pageView', pageId },
      (awsRum) => awsRum.recordPageView(pageId)
    );
  }

  /** @inheritdoc */
  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.disableAwsRum();
  }

  /**
   * Disables the sink: stops the AWS RUM client's own listeners, plugins,
   * and dispatch timer before dropping the reference — clearing `awsRum`
   * alone only stops this class from talking to it; the already-constructed
   * instance would otherwise keep running orphaned in the page (and, on
   * destroy, could duplicate telemetry if the app is bootstrapped again in
   * the same one) — and marks the session disabled, so every call site that
   * tears the client down does so atomically with the flag `recordOrBuffer`
   * checks, instead of each caller having to remember to set both.
   */
  private disableAwsRum(): void {
    uwtSafeVoid('rum.disable', () => this.awsRum?.disable());
    this.awsRum = null;
    this.disabled = true;
  }

  /**
   * Maps {@link UwtRumAppMonitorConfig} onto the SDK's own `PartialConfig`.
   *
   * The SDK merges this object over its own defaults with a shallow
   * `Object.assign`, so a key present with value `undefined` overwrites the
   * SDK's default instead of falling through to it. `allowCookies`,
   * `enableXRay`, `endpoint` and `telemetries` always carry this library's
   * own override; every other field goes through {@link omitUndefined} (or,
   * for `client`, a conditional spread) so an unset field is absent and the
   * SDK's own default applies.
   */
  private buildRumConfig(bootstrap: UwtRumBootstrap): AwsRumConfig {
    const { config } = bootstrap;
    const origin = this.document.defaultView?.location?.origin ?? '';

    // X-Ray trace header only on same-origin requests; a cross-origin
    // request with an unexpected header fails CORS preflight. Anchored at
    // both ends (with a path/query/fragment/end-of-string lookahead) so
    // `https://example.com` doesn't also match a look-alike host like
    // `https://example.com.attacker.example`.
    const sameOrigin = new RegExp(
      '^' + origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[/?#]|$)'
    );

    return {
      allowCookies: config.allowCookies ?? true,
      enableXRay: config.enableXRay ?? true,
      endpoint:
        config.endpoint ??
        `https://dataplane.rum.${config.region}.amazonaws.com`,
      telemetries: config.telemetries ?? [
        'errors',
        'performance',
        ['http', { addXRayTraceIdHeader: [sameOrigin] }]
      ],

      ...(config.client !== undefined ? { client: config.client } : {}),

      ...omitUndefined({
        releaseId: config.releaseId,
        clientBuilder: config.clientBuilder,
        applicationAttributes: config.applicationAttributes,
        alias: config.alias,
        headers: config.headers,
        cookieAttributes: config.cookieAttributes,
        sessionSampleRate: config.sessionSampleRate,
        sessionLengthSeconds: config.sessionLengthSeconds,
        sessionEventLimit: config.sessionEventLimit,
        suppressSessionStartEvent: config.suppressSessionStartEvent,
        userIdRetentionDays: config.userIdRetentionDays,
        sessionAttributes: config.sessionAttributes,
        eventPluginsToLoad: config.eventPluginsToLoad,
        enableW3CTraceId: config.enableW3CTraceId,
        recordResourceUrl: config.recordResourceUrl,
        batchLimit: config.batchLimit,
        dispatchInterval: config.dispatchInterval,
        eventCacheSize: config.eventCacheSize,
        candidatesCacheSize: config.candidatesCacheSize,
        retries: config.retries,
        useBeacon: config.useBeacon,
        signing: config.signing,
        compressionStrategy: config.compressionStrategy,
        fetchFunction: config.fetchFunction,
        pageIdFormat: config.pageIdFormat,
        pagesToInclude: config.pagesToInclude,
        pagesToExclude: config.pagesToExclude,
        routeChangeComplete: config.routeChangeComplete,
        routeChangeTimeout: config.routeChangeTimeout,
        disableAutoPageView: config.disableAutoPageView,
        debug: config.debug,
        enableRumClient: config.enableRumClient
      })
    } as unknown as AwsRumConfig;
  }

  /**
   * Attaches application identity once per session rather than once per event.
   *
   * `addSessionAttributes` covers custom events; the metadata hook stamps
   * the same attributes onto the client's own built-in events too. The hook
   * also adds `signedIn`, read when each event is recorded.
   *
   * See {@link UwtRumAppMonitorConfig.sessionAttributes} for how this
   * merges with a consumer-supplied base.
   */
  private applyIdentity(): void {
    if (!this.awsRum) {
      return;
    }

    const attributes = {
      application: this.config.application,
      environment: this.config.environment,
      appVersion: this.config.version
    };

    this.awsRum.addSessionAttributes(attributes);
    this.awsRum.setEventMetadataHook(() =>
      this.userKnown ? { ...attributes, signedIn: !!this.userId } : attributes
    );

    if (this.userId) {
      this.awsRum.pinUserId(this.userId);
    } else if (this.signOutPending) {
      this.signOutPending = false;
      this.awsRum.startSession({ userId: uwtUuid() });
    }
  }

  private applyCredentials(credentials?: UwtRumCredentials): void {
    if (!this.awsRum || !credentials) {
      return;
    }

    this.awsRum.setAwsCredentials({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    });

    this.scheduleRefresh(credentials.expiration);
  }

  private scheduleRefresh(expiration: string): void {
    const delay =
      new Date(expiration).getTime() - Date.now() - CREDENTIAL_REFRESH_SKEW_MS;

    if (!Number.isFinite(delay) || delay <= 0) {
      // Avoid tight-looping on an already-expired/unparsable expiration.
      this.scheduleRetry();
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(
      () => {
        this.refreshCredentials().catch(() => undefined);
      },
      Math.min(delay, MAX_TIMEOUT_MS)
    );
  }

  private async refreshCredentials(): Promise<void> {
    this.refreshTimer = null;
    try {
      const bootstrap = await this.credentialsProvider.load();
      if (this.destroyed) {
        return;
      }

      if (!bootstrap) {
        // null/undefined disables RUM for the session (see load()'s contract).
        this.disableAwsRum();
        return;
      }

      if (bootstrap.credentials) {
        this.applyCredentials(bootstrap.credentials);
      } else {
        this.scheduleRetry();
        this.reportFailure(
          'RUM credential refresh',
          new Error(
            'bootstrap omitted credentials for an already-authenticated ' +
              'session; keeping existing credentials and retrying'
          )
        );
      }
    } catch (error) {
      if (!this.destroyed) {
        this.scheduleRetry();
        this.reportFailure('RUM credential refresh failed', error);
      }
    }
  }

  /** Runs `attempt` (by default, a credential refresh) after `delayMs`. */
  private scheduleRetry(
    attempt: () => Promise<void> = () => this.refreshCredentials(),
    delayMs = CREDENTIAL_RETRY_DELAY_MS
  ): void {
    if (this.destroyed) {
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      attempt().catch(() => undefined);
    }, delayMs);
  }

  /**
   * Reports an init/refresh failure without leaking raw error content into
   * the production console.
   */
  private reportFailure(operation: string, error: unknown): void {
    if (!uwtIsDevMode()) {
      return;
    }
    uwtSafeVoid('rum.reportFailure', () => {
      console.warn(
        `[ngx-ui-watchtower] ${operation}`,
        uwtNormalizeError(error, this.redact)
      );
    });
  }

  private bufferItem(item: BufferedItem): void {
    this.buffer.push(item);
    if (this.buffer.length > PRE_INIT_BUFFER_LIMIT) {
      this.buffer.shift();
    }
  }

  private replayBuffer(): void {
    const pending = this.buffer;
    this.buffer = [];

    for (const item of pending) {
      uwtSafeVoid('rum.replay', () => {
        if (item.kind === 'event') {
          this.awsRum?.recordEvent(
            item.eventType,
            item.payload,
            this.sanitize(item.metadata)
          );
        } else if (item.kind === 'pageView') {
          this.awsRum?.recordPageView(item.pageId);
        } else {
          this.awsRum?.recordError(this.withOrigin(item.error, item.metadata));
        }
      });
    }
  }

  /**
   * Drops metadata keys under the reserved `aws:` prefix, which the client
   * would otherwise discard with a console warning. Also drops `null`
   * values, which {@link UwtTelemetryMetadata} permits but the SDK's
   * metadata type does not.
   */
  private sanitize(
    metadata?: UwtTelemetryMetadata
  ): Record<string, string | number | boolean> | undefined {
    if (!metadata) {
      return undefined;
    }

    const result: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (key.startsWith(RESERVED_PREFIX) || value === null) {
        continue;
      }
      result[key] = value;
    }

    return Object.keys(result).length ? result : undefined;
  }

  /**
   * Folds a forwarded error's origin into its name. `AwsRum.recordError`
   * takes no metadata argument, so `name` is the only field left to carry it.
   */
  private withOrigin(
    error: UwtTelemetryError,
    metadata?: UwtTelemetryMetadata
  ): UwtTelemetryError {
    const origin = metadata
      ? (metadata as Record<string, unknown>).application
      : undefined;
    if (typeof origin !== 'string' || origin === this.config.application) {
      return error;
    }
    return { ...error, name: `[${origin}] ${error.name}` };
  }
}
