import { DOCUMENT } from '@angular/common';
import { inject, Injectable, OnDestroy } from '@angular/core';
import type { AwsRum, AwsRumConfig } from 'aws-rum-web';
import {
  UWT_REDACT_CONFIG,
  UWT_TELEMETRY_ENABLED,
  UWT_TELEMETRY_IDENTITY,
  UwtTelemetryError,
  UwtTelemetryMetadata,
  UwtTelemetrySink,
  uwtMarkSessionStart,
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
import { UWT_RUM_SINK_OPTIONS } from '../uwt-rum-sink-options/uwt-rum-sink-options';
import { uwtHostHttpRealms } from '../uwt-rum-realms/uwt-rum-realms';

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
 * Events retained while the SDK loads. Bounded so a failed init cannot
 * grow the buffer without limit.
 */
const PRE_INIT_BUFFER_LIMIT = 100;

/** The event the RUM client records each time it starts a session. */
const SESSION_START_EVENT_TYPE = 'com.amazon.rum.session_start_event';

/**
 * The RUM client's session cookie: `cwr_s`, or `cwr_s_<app monitor id>` with
 * `cookieAttributes.unique` (both documented by AWS).
 */
function sessionCookieName(bootstrap: UwtRumBootstrap): string {
  const { config } = bootstrap;
  return config.cookieAttributes?.unique
    ? `cwr_s_${config.applicationId}`
    : 'cwr_s';
}

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
  private readonly options = inject(UWT_RUM_SINK_OPTIONS, { optional: true });
  private readonly document = inject(DOCUMENT);
  /**
   * False on the server and while telemetry is off: the client never starts —
   * no credentials fetch, no SDK import — and every call is a no-op.
   */
  private readonly canStart =
    uwtIsBrowser() &&
    (inject(UWT_TELEMETRY_ENABLED, { optional: true }) ?? true);

  /** Traces fragment realms' HTTP requests like this realm's own. */
  private readonly realms = this.canStart
    ? uwtSafe(
        'rum.realms',
        () =>
          this.document.defaultView
            ? uwtHostHttpRealms(this.document.defaultView)
            : undefined,
        undefined
      )
    : undefined;

  private awsRum: AwsRum | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private buffer: BufferedItem[] = [];
  private userId?: string;
  /**
   * Whether a session's start is recorded (`uwtMarkSessionStart`): only when
   * the client keeps sessions in its cookie, so a session outlives the page,
   * and the app hasn't suppressed session-start events. Set when the client
   * starts.
   */
  private marksSessionStarts = false;
  /** Set while {@link markSessionStart} runs, to stop it calling itself. */
  private markingSession = false;
  /** Set once a refresh returns null/undefined; distinct from `!awsRum` alone. */
  private disabled = false;
  /**
   * Memoized so every caller — `provideUwtTelemetryRumSink()`'s
   * `APP_INITIALIZER`, {@link ensureInitialized}, and a caller awaiting
   * `init()` directly — awaits the same underlying work, regardless of who
   * triggered it first.
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
      this.initPromise = this.performInit();
    }
    return this.initPromise;
  }

  private async performInit(): Promise<void> {
    try {
      const bootstrap = await this.credentialsProvider.load();
      if (!bootstrap?.config) {
        this.disableAwsRum();
        this.buffer = [];
        return;
      }

      const { AwsRum, FetchPlugin, XhrPlugin } = await import('aws-rum-web');
      if (this.destroyed) {
        return;
      }

      const sessionCookie = sessionCookieName(bootstrap);
      const hadSession = this.hasCookie(sessionCookie);

      const rumConfig = this.buildRumConfig(bootstrap);
      const awsRum = new AwsRum(
        bootstrap.config.applicationId,
        bootstrap.config.applicationVersion,
        bootstrap.config.region,
        rumConfig
      );
      this.awsRum = awsRum;

      this.marksSessionStarts =
        bootstrap.config.allowCookies !== false &&
        this.document.defaultView?.navigator.cookieEnabled !== false &&
        bootstrap.config.suppressSessionStartEvent !== true;
      this.applyIdentity();
      // The client can start the first session inside its constructor — the
      // landing page view, the navigation timing — before the metadata hook
      // exists to see its session_start. It writes the session cookie then,
      // so a cookie that wasn't there a moment ago means a session that
      // started just now.
      if (
        this.marksSessionStarts &&
        !hadSession &&
        this.hasCookie(sessionCookie)
      ) {
        this.markSessionStart();
      }
      this.applyCredentials(bootstrap.credentials);
      this.replayBuffer();
      // Not while the client is switched off: it has disabled its own
      // plugins, and a fragment's would otherwise enable themselves on load.
      if (bootstrap.config.enableRumClient !== false) {
        uwtSafeVoid('rum.realms.start', () =>
          this.realms?.start(
            { FetchPlugin, XhrPlugin },
            awsRum,
            rumConfig.telemetries ?? []
          )
        );
      }
    } catch (error) {
      this.disableAwsRum();
      this.buffer = [];
      this.reportFailure('RUM init failed, monitoring disabled', error);
    }
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
   * sampling.
   *
   * @param userId the application's own user identifier, or `undefined`
   * (or `''`) on sign-out
   */
  setUserId(userId: string | undefined): void {
    uwtSafeVoid('rum.setUserId', () => {
      this.userId = userId;

      if (userId) {
        this.awsRum?.pinUserId(userId);
        return;
      }

      this.awsRum?.startSession({ userId: uwtUuid() });
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
    uwtSafeVoid('rum.realms.stop', () => this.realms?.stop());
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
    const document = this.document;
    const origin = document.defaultView?.origin;

    // X-Ray trace header only on same-origin requests; a cross-origin
    // request with an unexpected header fails CORS preflight. The client
    // tests each URL as the caller passed it — Angular's HttpClient passes
    // `/api/...` unresolved — so resolve it the way the browser will
    // (backslashes, stray whitespace and all) before comparing origins. A
    // RegExp, as the client's config expects, whose `test` does that; the
    // pattern itself never matches, so anything that bypasses `test` adds
    // no header rather than adding it everywhere.
    const excluded = this.options?.xRayExcludeUrls ?? [];
    const sameOrigin = Object.assign(/(?!)/, {
      test: (url: string) => {
        try {
          const resolved = new URL(url, document.baseURI);
          return (
            resolved.origin === origin &&
            // search(), not test(): a `g` pattern's test() carries lastIndex
            // over, and would skip every other request.
            !excluded.some((pattern) => resolved.href.search(pattern) >= 0)
          );
        } catch {
          return false;
        }
      }
    });

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
   * the same attributes onto the client's own built-in events too.
   *
   * See {@link UwtRumAppMonitorConfig.sessionAttributes} for how this
   * merges with a consumer-supplied base.
   *
   * The hook also sees the client's own `session_start` event, recorded
   * each time it starts a session, and records that moment as the
   * session's start (`uwtMarkSessionStart`) — the client keeps no start time
   * itself. Only while {@link marksSessionStarts}.
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
    this.awsRum.setEventMetadataHook((type) => {
      if (this.marksSessionStarts && type === SESSION_START_EVENT_TYPE) {
        this.markSessionStart();
      }
      return attributes;
    });

    if (this.userId) {
      this.awsRum.pinUserId(this.userId);
    }
  }

  /**
   * Records the current session's start as now. Called right after a session
   * started, so it is current and reading its id doesn't start another one —
   * except with a session length of 0, where the read starts a new session
   * whose session_start calls back in here; the guard stops that recursion.
   */
  private markSessionStart(): void {
    if (this.markingSession) {
      return;
    }
    this.markingSession = true;
    try {
      uwtSafeVoid('rum.markSessionStart', () => {
        const sessionId = this.awsRum?.getSessionId();
        if (sessionId) {
          uwtMarkSessionStart(sessionId);
        }
      });
    } finally {
      this.markingSession = false;
    }
  }

  /** Whether the page has a cookie with this name; `false` when cookies can't be read. */
  private hasCookie(name: string): boolean {
    return uwtSafe(
      'rum.readCookie',
      () =>
        this.document.cookie
          .split(';')
          .some((cookie) => cookie.trim().split('=')[0] === name),
      false
    );
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

  private scheduleRetry(): void {
    if (this.destroyed) {
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshCredentials().catch(() => undefined);
    }, CREDENTIAL_RETRY_DELAY_MS);
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
