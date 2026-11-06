# Session lifecycle and `sessionId`

How sessions work for ngx-ui-watchtower: who owns them, when `sessionId` exists, when it changes,
and what the library should fix.

**Sources.** The installed `aws-rum-web` **3.2.1** source (`@aws-rum/web-core` and
`@aws-rum/web-slim` 3.2.1, under `node_modules/`), the library source on branch
`15-add-sessionid-and-userid-to-bi-events`, and the AWS documentation. Each claim is marked:

- **[code]** — verified by reading the source; not run in a browser.
- **[doc]** — stated in AWS documentation.
- **[unverified]** — browser behavior not tested.

SDK paths below are relative to `node_modules/@aws-rum/web-core/dist/es/` unless stated otherwise.
Library paths are relative to `projects/ngx-ui-watchtower/`.

## Summary

The AWS RUM client owns the session completely. The library never creates, stores or rotates a
session id. It shapes the session in three ways only: it turns cookies on (so a session survives
reloads), it decides when the RUM client exists (so when `sessionId` becomes available), and it
rotates the session on sign-out.

The library should not add its own session management. It should fix five risks in how it uses
the SDK's session (see [Risks and recommended fixes](#risks-and-recommended-fixes)).

## 1. Session lifecycle

All of it lives in the SDK's `SessionManager`.

**Creation.** A session is created lazily, on the first `getSession()` call:

- At construction the session is a nil placeholder (`00000000-…`), or the session restored from a
  valid `cwr_s` cookie. **[code]** `sessions/SessionManager.js:40-57`
- `getSession()` creates a session (UUID v4) when the current one is nil or expired.
  **[code]** `sessions/SessionManager.js:105-114, 304-327`
- `getSession()` is called by every `recordEvent`, by every dispatch that has events, and by
  `getSessionId()`. So reading the id has side effects: it can create or rotate the session and
  emit `session_start`. **[code]** `event-cache/EventCache.js:90, 138, 346`

**Lifetime.** `sessionLengthSeconds` (default 1800 s) is an **inactivity timeout**:

- The expiry moves to now + 30 min on every *recorded* event (`incrementSessionEventCount` →
  `renewSession`). **[code]** `sessions/SessionManager.js:240-243, 348-352`
- Rotation is lazy: nothing happens at the moment of expiry; the next `getSession()` call creates the
  new session. **[code]**
- User activity alone doesn't renew it — only recorded events. The library's default telemetries
  (`errors`, `performance`, `http`) don't include DOM interactions.
  **[code]** `rum/src/lib/uwt-rum-telemetry.sink/uwt-rum-telemetry.sink.ts:382-386`
- AWS describes the setting only as "The duration of a session (in seconds)". The sliding
  behavior comes from the code. **[doc]**
  ([configuration.md](https://github.com/aws-observability/aws-rum-web/blob/main/docs/configuration.md))

**Replacement.** A new id replaces the old one on expiry, on `startSession()` (the library calls it
on sign-out) and on `pinSessionId()` (the library never calls it). Each new session re-rolls
sampling; the nil placeholder and the first real session share one decision.
**[code]** `sessions/SessionManager.js:308-313`

## 2. When `sessionId` becomes available

`UwtRumTelemetrySink.getSessionId()` returns `this.awsRum?.getSessionId()`, so it is `undefined`
until the client exists, then synchronous. **[code]** `rum/src/lib/uwt-rum-telemetry.sink/uwt-rum-telemetry.sink.ts:249-255`

The order:

1. An app initializer starts `sink.init()` without waiting for it.
   `src/lib/providers/uwt-telemetry-common.providers/uwt-telemetry-common.providers.ts:309-321`,
   `rum/src/lib/uwt-rum.providers/uwt-rum.providers.ts:39-41`
2. `performInit` awaits `credentialsProvider.load()` (the broker request), then
   `import('aws-rum-web')` (a chunk download), then constructs `AwsRum`.
   `uwt-rum-telemetry.sink.ts:153-176`
3. From then on, `getSessionId()` returns the restored cookie session or creates one on the spot.

So it is **asynchronous**: available after bootstrap, one broker round-trip and one chunk load.
It is never available:

- on the server, or with telemetry off (`canStart`, `uwt-rum-telemetry.sink.ts:110-112`);
- for the rest of the page if the broker returns `null` or `load()` throws
  (`uwt-rum-telemetry.sink.ts:156-160, 177-180`) — as of version 0.3.0; see risk 3 below for the
  retry since added;
- after a credential refresh returns `null` — it disappears mid-page
  (`uwt-rum-telemetry.sink.ts:499-503`). **[code]**

In a fragment, `UwtBroadcastTelemetrySink.getSessionId()` returns the host's last announced id,
and `undefined` until the host answers.
**[code]** `src/lib/sinks/uwt-broadcast/uwt-broadcast-telemetry.sink.ts:65, 99-101, 124-132`

## 3. When `sessionId` changes

| Trigger | Changes? | Why |
|---|---|---|
| Route navigation | No | It only records a page view, which renews the expiry. **[code]** |
| Reload within 30 min of the last recorded event | No | Restored from `cwr_s`, because the library sets `allowCookies: true` (the SDK default is `false`). **[code]** `uwt-rum-telemetry.sink.ts:377`, `sessions/SessionManager.js:279-294` |
| Reload after that, or with cookies unavailable | Yes | Cookie expired or never written. AWS: cookies make the IDs "persist across page loads". **[doc]** ([RUM cookies](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM-privacy.html#CloudWatch-RUM-cookies)) |
| Tab hidden or visible | No | It only flushes. **[code]** `dispatch/Dispatch.js:55-71, 195-197` |
| 30 min with no recorded event | Yes, on the next `getSession()` | Lazy expiry. **[code]** |
| Event cap (200) reached | Not immediately | Dropped events stop renewing, so the session rotates 30 min after the last *recorded* event, even while the user is active. **[code]** `event-cache/EventCache.js:92-98` |
| Sign-out: `setUserId(undefined)` or `''` | Yes | `startSession({ userId: uuid })` creates a new session and emits `session_start`. **[code]** `uwt-rum-telemetry.sink.ts:268-279` |
| Sign-in: `setUserId(id)` | No | `pinUserId` changes only the user. **[code]** |
| App re-bootstrap in the same page | No, if the cookie is valid | The new `AwsRum` restores `cwr_s`. **[code]** |

## 4. AWS RUM vs. the library

- **AWS RUM controls** creation, expiry, rotation and persistence of the id, sampling and the
  event cap. **[code]**
- **The library controls:**
  - `allowCookies: true` by default — the only reason a session survives reloads;
  - pass-through of `sessionLengthSeconds`, `sessionEventLimit`, `sessionSampleRate`,
    `suppressSessionStartEvent`, `userIdRetentionDays` and `cookieAttributes` (each omitted when
    unset, so the SDK default applies — `buildRumConfig`, `uwt-rum-telemetry.sink.ts:376-424`);
  - when the client exists (section 2), and the sign-out rotation.
- **The library never** seeds `sessionId` or `userId` at construction (`buildRumConfig` forwards
  neither), calls `pinSessionId`, caches the id, or mints its own.

## 5. End-to-end flow

1. **Read.** Each emitter reads `sink.getSessionId()` when it builds a payload:
   - BI events: `src/lib/services/uwt-bi-telemetry.service/uwt-bi-telemetry.service.ts:121-125`;
   - scenarios: `src/lib/scenario/uwt-scenario/uwt-scenario.ts:473, 586-592, 682` — read again for
     the start, each step and the end;
   - log records: `src/lib/services/uwt-logger.service/uwt-logger.service.ts:321-324`.
2. **Record.** `sink.record()` hands the payload to `awsRum.recordEvent`, or buffers it before init
   (newest 100 kept) and replays it after init. `uwt-rum-telemetry.sink.ts:204-237, 562-581`
3. **Dispatch.** The SDK puts the ids on the batch, not on each event: `createRequest()` reads
   `UserDetails: { userId, sessionId }` when the batch is sent. **[code]** `dispatch/Dispatch.js:223-231`;
   `@aws-rum/web-slim/dist/es/orchestration/Orchestration.js:137`: "sessionId rides on UserDetails
   per batch, not per event".
4. **Fragments.** The fragment sink forwards to the host. The host announces its identity only on:
   - winning the leader election;
   - a fragment's `identity-request`;
   - sign-in or sign-out;
   - fragment activity, when the id changed since the last announcement.

   It never announces its own session change unprompted.
   **[code]** `src/lib/sinks/uwt-broadcast/uwt-broadcast-host.service.ts:100-106, 137-176, 266-285`

The payload's `sessionId` can therefore differ from the batch's:

- **buffered before init** — the payload has `undefined`, the batch has the real id (documented in
  DESIGN.md §5);
- **after sign-out** — see risk 1;
- **a fragment's first event after the host's session changes** — it carries the old id.

## 6. Configuration and defaults

SDK defaults: `@aws-rum/web-slim/dist/es/orchestration/Orchestration.js:30-64`. The library keeps
all of them except `allowCookies`.

| Option | SDK default | Effect on the session |
|---|---|---|
| `allowCookies` | `false` (library: `true`) | Persists `cwr_s` (session) and `cwr_u` (user) across page loads |
| `sessionLengthSeconds` | 1800 | Inactivity window, renewed by each recorded event |
| `sessionEventLimit` | 200 (`0` = no limit) | Cap per session; the count is stored in the cookie and survives reloads |
| `sessionSampleRate` | 1 | Re-rolled per new session; an unsampled session still has an id |
| `userIdRetentionDays` | 30 (`0` = nil user id) | Lifetime of `cwr_u` |
| `cookieAttributes` | `domain: hostname, path: '/', sameSite: 'Strict', secure: true, unique: false` | `unique: false` means one cookie name for every app monitor on the hostname |
| `suppressSessionStartEvent` | `false` | Whether a new session emits `session_start` |

## 7. Edge cases

- **Multiple tabs.** Each tab reads the cookie once, at construction, then keeps its own session in
  memory. **[code]**
  - Tabs opened while the cookie is valid share one id. They drift apart once one of them rotates
    (inactivity or sign-out).
  - Each tab overwrites the cookie with its own session; the next page load adopts whichever wrote
    last.
  - Two tabs that start with no cookie get two different sessions.
  - Fragments on the default broadcast channel: a losing tab's fragment events land in the winning
    tab's session. DESIGN.md documents this and prescribes a per-page-load channel.
- **Several apps on one hostname.** With `unique: false`, app monitors on the same host and path
  share `cwr_s` and `cwr_u`: the same id, sampling decision and restored event count. **[code]**
  `cookieAttributes.unique: true` separates only `cwr_s`: in 3.2.1 the user cookie is always the
  unsuffixed `cwr_u` (`sessions/SessionManager.js:274-277`), although the AWS docs say all four
  storage names get the suffix.
- **Reload into a capped or unsampled session.** The restored session never gets an expiry:
  `getSessionFromCookie` doesn't set `sessionExpiry`, and `new Date() >= undefined` is `false`;
  only recorded events set it. **[code]** `sessions/SessionManager.js:96, 112, 279-294`
  - A tab reloaded into a session that already hit 200 events, or wasn't sampled, keeps it for the
    rest of that page's life and drops every event.
  - An SDK bug in 3.2.1; it only matters with a sample rate below 1 or heavy sessions.
- **HTTP (not HTTPS) outside localhost.** The `Secure` cookie is rejected, so every load gets a new
  session and a new user id. **[unverified]**
- **Failed or slow init.**
  - Everything recorded before init carries `undefined`.
  - The buffer keeps the newest 100 items.
  - A failed init is never retried, so the whole page runs without a session. **[code]**
- **Shared device.**
  - `pinUserId(appUserId)` writes the app's user id into `cwr_u` for 30 days.
    **[code]** `sessions/SessionManager.js:339-346`
  - If someone closes the tab without signing out, the next page load restores that id as the
    anonymous user, so the next visitor's events carry the previous user's id until sign-in.
    **[code]** `sessions/SessionManager.js:251-262`
  - A `setUserId(undefined)` before init does nothing to RUM. **[code]**

## Risks and recommended fixes

**Status:** risk 3 is fixed and the docs are corrected, in the working tree of branch
`15-add-sessionid-and-userid-to-bi-events` (not committed). Risks 1, 2 and 4 were implemented, then
removed as not worth their cost; risk 5 is documented. The SDK bug report is still open.

| Risk | Decision |
|---|---|
| 1 | Not changed. Saving a few seconds of attribution isn't worth a new failure mode: the SDK's `dispatch()` returns no promise, so a failed send on sign-out would surface as an unhandled rejection. |
| 2 | Not changed. It only affects apps that call `setUserId(undefined)` when nobody signed in; the docs now say to call it on a real sign-out only. A guard needed a new `localStorage` key and its edge cases. |
| 3 | Fixed: a failed broker request is retried every 30 s, up to ten attempts, with the buffer kept; a sign-out made meanwhile is applied when the client starts. A failed SDK download or client start is not retried, because browsers remember a failed module import. The whole start runs outside Angular's zone, so the SDK's dispatch interval and the sink's timers no longer keep a zone-based app unstable (an older bug, found in review). |
| 4 | Not changed. Only a fragment's first event after a shell session change carries the old id in its payload; the RUM batch is right, and the host re-announces after that event. A fix needed new public API and broke sinks written with `implements`. |
| 5 | Documented (DESIGN.md sign-out, `userIdRetentionDays` JSDoc); `userIdRetentionDays: 0` is the option. |
| Docs | `sessionLengthSeconds`, `allowCookies`, `cookieAttributes` (`unique` renames only `cwr_s`) and the `load()` contract (throw to retry, `null` to disable) are corrected in JSDoc, DESIGN.md and README. |

1. **Sign-out misattributes recent events.** Events still queued (up to 5 s, at most 100) go out
   under the new anonymous user and session, because ids are attached at dispatch.
   **Fix:** call `this.awsRum.dispatch()` just before `startSession()` in `setUserId`.
   `dispatchFetch` builds the request synchronously (`dispatch/Dispatch.js:16-22`), so that batch
   keeps the old ids.
2. **Session rotates on every page load.** `setUserId(undefined)` rotates even when nobody was
   signed in. Auth libraries that emit "not signed in" at startup start a new session on every load,
   breaking reload continuity and inflating session counts.
   **Fix:** rotate only on a transition from a signed-in user to none.
3. **A transient broker failure disables RUM for the page.** No session and no `sessionId` until
   the next load.
   **Fix:** retry init with backoff, like credential refresh already does.
4. **Fragments carry a stale or missing `sessionId`.** The host doesn't announce when it initializes
   or rotates on its own.
   **Fix:** re-announce once the host's sink finishes init — for example a small "identity changed"
   hook on the sink. Or accept it: the RUM batch is still correct.
5. **Shared-device user carry-over** (section 7).
   **Fix:** document it at minimum. Rotating at init when no app user is pinned and the restored
   RUM user id is the last app user would fix it, but it interacts with risk 2 — a product decision.

**Docs:**

- DESIGN.md:401 and the `sessionLengthSeconds` JSDoc
  (`rum/src/lib/uwt-rum-credentials/uwt-rum-credentials.ts:68`) should say "inactivity timeout,
  renewed by each recorded event", not "session length".
- Recommend `cookieAttributes.unique: true` when several app monitors share a hostname (it
  separates only the session cookie).
- Report the restored-session expiry bug to `aws-rum-web`.

## Should the library manage sessions itself?

No. Keep delegating to RUM and never mint an id. Seeding `sessionId` or calling `pinSessionId`
switches the SDK to manual mode, where it never rotates the id on its own
(`sessions/SessionManager.js:89-103`). Fixes 1–4 are small and stay within the current design.
