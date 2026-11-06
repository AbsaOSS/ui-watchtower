# Plan: the Watchtower Lab

For the agent working on `@absaoss-cps/ngx-ui-watchtower` in its own
repository. Read `CLAUDE_HANDOFF.md` first for the library itself; this file
is the plan for testing it end to end without any consuming app.

## Why

In cps-shared-ui, the library's only real-browser exercise was the
`composition` demo app, which stays behind — and even there RUM never ran:
its credentials provider calls `/rum/init`, and nothing serves that path.

The library's 822 unit tests run under jsdom, which has none of these: a real
`BroadcastChannel`, Web Locks, `pagehide`/`sendBeacon`, User Timings, separate
JavaScript realms, or a RUM SDK talking to a network. The lab makes the new
repository test the library the way a real application uses it.

## Decisions already made by the user

- **No real AWS.** RUM runs against a local mock endpoint, fully offline. No
  AWS account or credentials are involved, in CI or locally.
- **Real Web Fragments** for the micro-frontend part — the `web-fragments`
  package with its gateway and `<web-fragment>` element — not plain iframes.

## Layout

```
projects/
  ngx-ui-watchtower/          the library
  watchtower-lab-shell/       Angular app with SSR — RUM sink, broadcast host
  watchtower-lab-fragment/    zoneless Angular app — a Web Fragment in 'broadcast' mode
  watchtower-consumer-smoke/  minimal app installed from the packed .tgz, never from source
lab server = the shell's SSR Express server, extended with:
  Web Fragments gateway       getNodeMiddleware(gateway) from 'web-fragments/gateway/node';
                              registerFragment({ fragmentId: 'lab-fragment', endpoint, routePatterns })
  mock RUM broker             GET /rum/init
  mock RUM dataplane          POST /appmonitors/:id — keeps every PutRumEvents batch
  mock log backend            POST /api/logs, GET /api/logs?… (answers query())
  test hooks                  GET /__lab/rum, GET /__lab/logs, POST /__lab/reset,
                              POST /__lab/broker-mode (ok | null | fail | short-expiry)
e2e/                          Playwright against the lab server
```

## Key mechanisms

**The real RUM SDK, against a local endpoint.** `UwtRumAppMonitorConfig`
exposes `endpoint` and `signing`. The mock broker returns
`endpoint: 'http://localhost:<port>'`, `signing: false` and fake credentials.
`aws-rum-web` then runs unmodified, and every batch it would send to AWS lands
in the mock dataplane, where tests can assert on exactly what AWS would
receive. The credentials are never used to sign anything, but they must be
present: the sink schedules a credential refresh only when credentials arrive,
so without them `short-expiry` could never trigger one. Each broker mode
exercises a behaviour:

| Broker mode    | Expected library behaviour                        |
| -------------- | ------------------------------------------------- |
| `ok`           | RUM records normally                              |
| `null`         | RUM disabled for the session; no requests at all  |
| `fail`         | Fail-open: the app is unaffected, nothing is sent |
| `short-expiry` | Credentials refresh, without a tight retry loop   |

- `short-expiry` returns an `expiration` just over 5 minutes away — the sink
  refreshes 5 minutes before expiry, so the refresh fires within seconds.
  Also cover an already-expired `expiration`: the sink must fall back to its
  30-second retry rather than refresh immediately.
- `fail` answers with an HTTP error, and the lab's credentials provider must
  **throw** on a non-OK response rather than return `null`. Returning `null`
  would make `fail` indistinguishable from `null`; throwing exercises the
  sink's own failure path, which disables RUM while the app carries on.

**Web Fragments.** The shell calls `initializeWebFragments()` from
`web-fragments` and renders `<web-fragment fragment-id="lab-fragment">`. The
gateway, mounted in the SSR server, routes that fragment to the fragment app.

- The shell provides `provideUwtTelemetryRumSink()`,
  `provideUwtTelemetryBroadcastHost(channelId)` and a log provider bound to
  `UWT_LOG_API_PROVIDER` (the mock backend). The broadcast host fails at
  bootstrap without a log provider.
- The fragment provides `provideUwtTelemetrySink('broadcast')` and nothing
  else for destinations; it reads the per-tab channel id from
  `window.top.__uwtTelemetryChannel`, bound through `UWT_BROADCAST_CHANNEL`
  with `useFactory`. The library's DESIGN.md §13 has the full pattern.

**Coverage of modes.** The shell uses SSR (the library's server no-ops) and
a zone. The fragment is zoneless — the library schedules its long-lived
timers through `runOutsideAngular` only when a zone exists, so both paths get
exercised.

**The consumer smoke app** installs the library from `npm pack` output
rather than source paths. That checks what source paths hide: the package's
exports map, its typings, optional peer dependencies, and the guarantee that
an app which never imports `/rum` has no `aws-rum-web` in its bundle.

## Lab shell pages, for manual exploration

One page per concern — a few buttons plus a live readout:

- **Scenarios** — start; steps; every settle method; timeout; backdating;
  aggregates; `traceScenario` with `switchMap` supersession; `toRecord()`.
- **BI** — `track`; the 400 ms deduplication; an event-type override.
- **Logging** — named loggers; per-logger levels; `mirrorErrorsToRum`;
  `query()` against the mock backend.
- **Identity** — sign in; sign out with `undefined` and with `''`.
- **Privacy** — values that must be redacted, with `scanValuePatterns` on.
- **Lifecycle** — hide the tab; navigate away.
- **Fragments** — the embedded fragment, with its own controls.
- **"On the wire"** — what the mock dataplane and log backend actually
  received, next to what the app did.

The destination is chosen at bootstrap with
`?destination=rum|noop` — one at a time, as in production.

## Automated suite — Playwright, chromium and webkit, in CI

1. **Wire format.** A settled scenario arrives as exactly one
   `com.uwt.scenario` event, with its steps packed inside and the identity
   attributes present. BI events arrive as `com.uwt.bi`.
   `emitLifecycleEvents: true` adds `com.uwt.scenario.step` events. Values
   the app passes for redaction never arrive.
2. **Lifecycle.** `pagehide` delivers pending events by beacon; a tab going
   hidden flushes; scenarios still running arrive as `abandoned` with
   `metadata.abandonedBy: 'page-hidden'`.
3. **Credentials.** The four broker modes above.
4. **Web Fragments.**
   - Fragment events are recorded once, through the shell's RUM client, and
     attributed to the fragment's own `application`.
   - Fragment log lines reach the mock log backend.
   - A fragment's `query()` is answered from the shell's backend.
   - Signing in or out in one realm applies to all of them.
   - Two tabs, each with its own channel, don't cross-attribute events.
5. **Consumer smoke.** `npm pack` → install the tarball into
   `watchtower-consumer-smoke` → `ng build` for browser and SSR. It builds,
   the types resolve, the bundle contains no `aws-rum-web` without `/rum`,
   and the server render succeeds.
6. **Trace capture.** Regenerate the library's `telemetry-trace.txt` from the
   lab, replacing cps-shared-ui's
   `projects/composition/src/app/telemetry-trace.capture.spec.ts`.

## Starting points to copy from cps-shared-ui

From `projects/composition/src/app/`:

- `services/app-telemetry.service.ts` — route-navigation scenarios;
- `services/app-log-api.provider.ts`;
- `services/rum-credentials.provider.ts`;
- `services/telemetry.schema.ts`;
- `telemetry-trace.capture.spec.ts`.

## Order of work

1. The shell app and its SSR server with the mock broker, dataplane and log
   backend; suite items 1–3.
2. The fragment app and the Web Fragments gateway; item 4.
3. The consumer smoke app and the pack-and-install step; item 5.
4. Trace capture; item 6.

CI then runs: unit tests → library build → lab build → Playwright → consumer
smoke.

## Done when

- `npm run lab` starts the server; the fragment renders inside the shell; "On
  the wire" fills as the buttons are used.
- The Playwright suite passes headless on chromium and webkit, with no
  network access beyond localhost.
- Breaking `/rum`'s `ng-package.json` on purpose makes the consumer smoke
  step fail — proof that it guards the published package.

Follow the working rules in `CLAUDE_HANDOFF.md` throughout (no commits unless
asked, verify before reporting, mutation-check tests).
