# Handoff: ngx-ui-watchtower

Context for an agent continuing work on the `@absaoss-cps/ngx-ui-watchtower` library. Written
2026-10-06, updated later the same day, at the end of a long session with the user (fateeand). Read the
whole file before acting.

The library was developed inside the `cps-shared-ui` repository and is moving
to a new repository, at the same path: **`projects/ngx-ui-watchtower`**. Paths
below are relative to the repository root. Where something depended on the
old repository, the section "Moving from cps-shared-ui" says what to do.
Copy `WATCHTOWER_LAB_PLAN.md` along with this file — it is the next piece of
work (see "Next piece of work").

## The library

Angular 22, TypeScript ~6.0, built with ng-packagr, tested with Jest (jsdom,
jest-preset-angular). Three entry points:

| Entry point                                  | Source                                       | Optional peer                                            |
| -------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `@absaoss-cps/ngx-ui-watchtower`             | `projects/ngx-ui-watchtower/src`             | —                                                        |
| `@absaoss-cps/ngx-ui-watchtower/rum`         | `projects/ngx-ui-watchtower/rum/src`         | `aws-rum-web`                                            |
| `@absaoss-cps/ngx-ui-watchtower/diagnostics` | `projects/ngx-ui-watchtower/diagnostics/src` | `cps-ui-kit` (+ `@angular/forms`, `@angular/animations`) |

- **Main entry:** `UwtScenarioTelemetryService` / `UwtScenario` (user
  journeys), `UwtBITelemetryService` (business events), `UwtLoggerService`
  (a factory: `getLogger(name)` + `query()`), sinks (`UwtTelemetrySink`,
  broadcast, noop), `UwtTelemetryMonitor`, redaction, and providers
  (`provideUwtTelemetry` + `withLogging` / `withScenarios` / `withBIEvents` /
  `withRedaction`; `provideUwtTelemetryDestination` for the destination).
- **rum:** the AWS CloudWatch RUM sink and `UwtRumCredentialsProvider`.
- **diagnostics:** an in-app popup listing everything sent, opened with
  Shift+E+I.
- **Docs:** `README.md` is a short quick guide for people (~340 lines).
  `DESIGN.md` is the full development design (~2700 lines), in 14 numbered
  sections: Goals, Non-goals, Architecture (incl. "Public API" and
  "Destinations"), Data model, Lifecycle, AWS mapping, Metrics, Correlation,
  Privacy, Configuration, Error handling and performance, Usage, Multiple
  realms, OpenTelemetry. The README does not link to it and
  code comments don't cite its sections — the user removed those on
  purpose; **don't add them back** unless asked.

## What was built in this session

1. **Diagnostics popup** (`diagnostics/`): a non-modal cps-dialog with three
   sections (BI / Scenario / Logging). Each section has its own search,
   field filters, Copy JSON and Download JSON; Pause and Clear are global.
   The store keeps per-section ring buffers (500 events), batches screen
   updates every 250 ms, newest first. It is fed by `UwtTelemetryMonitor`
   (main entry): every hand-off site publishes to it _after_ the real
   hand-off, deep-cloned, and only while someone is subscribed. Light theme
   only (user: "no dark mode for now!").
2. **Fragment logs forwarded to the shell.** `provideUwtTelemetrySink('broadcast')`
   also binds `UWT_LOG_API_PROVIDER` to `UwtBroadcastLogApiProvider`
   (`src/lib/providers/uwt-broadcast-log-api.provider/`). Channel messages
   `log`, `log-flush`, `log-query`, `log-query-result` are defined and
   validated in `src/lib/sinks/uwt-broadcast/uwt-broadcast.messages.ts`. The
   host (`uwt-broadcast-host.service.ts`):
   - requires `UWT_LOG_API_PROVIDER` — fails at bootstrap without one (the
     user chose this);
   - stays inactive with a warning in a realm that itself forwards, which
     would otherwise loop forever;
   - links a fragment's `mirrorErrorsToRum` error to its log record through
     `relatedSequence` (same realm, next message, same name and message);
   - always answers queries (`[]` on failure); only the elected leader does.

   The query timeout is 10 s (`UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS`); it runs
   outside NgZone and resolves inside it.

3. **`UwtNoopLogApiProvider`** — the explicit way to say "no logs", needed
   for a shell that hosts fragments but keeps no logs.
4. **`setUserId('')` means sign-out**, same as `undefined` (stated in the
   abstract sink's contract). Sinks store the value as given — the user
   rejected normalizing `''` to `undefined`. RUM checks stay truthiness-based.
5. **Popup paging:** `first` is a `linkedSignal` of the rows, reset to page 1
   when a filter or clear leaves fewer rows than the current offset.
6. **Characters, not bytes:** `maxPayloadCharsInView` (was
   `maxPayloadBytesInView`) and `sizeChars` (was `sizeBytes`). Truncation
   never splits a surrogate pair.
7. **`markCleanupFallbackMs` above 2³¹−1 ms** is honoured by rescheduling,
   like `scheduleTimeout()`.
8. **Model dedupe:** `UwtTelemetryAttribution { application; sessionId?;
userId? }` in the common models; `UwtScenarioRecord` and `UwtLogRecord`
   extend it and `UwtBIEvent` picks `application`; `UwtLogRecord extends
Omit<UwtLogDetail, 'error'>`; `UwtScenarioStepEvent` picks its identity
   fields from `UwtScenarioRecord`.
9. **Doc examples** each declare the fields they use, inside a class.
10. **BI rename:** names with `Bi` in the middle became `BI` —
    `UwtBITelemetryService`, `UwtBITelemetryConfig`, `UwtBIEvent`,
    `UwtBIEventName(s)`, `UwtBIEventDetail`, `UwtBIEventCorrelation`,
    `withBIEvents`. Unchanged on purpose: lowercase-leading names
    (`biTelemetry`, `biConfig`), file names (`uwt-bi-*`), and the `'bi'`
    values (`com.uwt.bi`, `kind: 'bi'`, the popup's `'bi'` section).
11. **One swappable destination.** A realm has exactly one telemetry
    destination. `provideUwtTelemetryDestination(SinkClass, { init? })`
    registers it (binds `UwtTelemetrySink`, runs `init` once, fail-open);
    `provideUwtTelemetryRumSink()` and `provideUwtTelemetrySink('broadcast' |
'noop')` are built on it. Two different destinations fail bootstrap with
    a clear error; the same one twice is fine. `uwtClassifyTelemetryEvent`
    tells a sink whether `record()` got a scenario record, a step event, a BI
    event or something else. The acceptance test is in
    `uwt-telemetry-common.providers.spec.ts` ("brand-new destination").
12. **OpenTelemetry: documented, not built.** DESIGN.md §14 says how to
    connect an OTel destination later (a `UwtTelemetrySink` that builds spans
    and OTel log records, the app's SDK and collector, the one-line swap) and
    its limits. The mapping was checked against the real OTel SDK; it works
    without library changes, except live trace context, which needs core
    changes.
13. **Rebrand.** The package is `@absaoss-cps/ngx-ui-watchtower`, in `projects/ngx-ui-watchtower`. Every own `Cps`/`cps`/
    `CPS_` name became `Uwt`/`uwt`/`UWT_`, files `cps-*` became `uwt-*`, and
    runtime values changed too: default event namespace `com.uwt`, channel
    `ngx-ui-watchtower`, console prefix `[ngx-ui-watchtower]`. Anything still
    named `cps` belongs to cps-ui-kit (its components, tokens, `.cps-sr-only`)
    or to the `@absaoss-cps` scope / `cps-shared-ui` repository — leave it.
14. **Public package.** `@absaoss-cps` is an npm org, so the package is
    scoped; its `package.json` has `"publishConfig": { "access": "public" }`
    so a plain `npm publish` creates it public. Publishing needs rights in
    the org (or an org-issued CI token). The release workflow still
    publishes only cps-ui-kit.

## Moving from cps-shared-ui

The library folder moves as is. These things lived **outside** it and have to
be recreated or decided in the new repository.

**Workspace wiring (needed for anything to build or test):**

- `angular.json` — a library project:
  ```json
  "ngx-ui-watchtower": {
    "projectType": "library",
    "root": "projects/ngx-ui-watchtower",
    "sourceRoot": "projects/ngx-ui-watchtower/src",
    "prefix": "uwt",
    "architect": {
      "build": {
        "builder": "@angular/build:ng-packagr",
        "options": { "project": "projects/ngx-ui-watchtower/ng-package.json" },
        "configurations": {
          "production": { "tsConfig": "projects/ngx-ui-watchtower/tsconfig.lib.prod.json" },
          "development": { "tsConfig": "projects/ngx-ui-watchtower/tsconfig.lib.json" }
        },
        "defaultConfiguration": "production"
      },
      "test": { "builder": "@angular-builders/jest:run", "options": { "zoneless": false } }
    }
  }
  ```
- Root `tsconfig.json` — `paths` for the three entry points, and
  `references` to the six library tsconfigs (`tsconfig.lib.json` and
  `tsconfig.spec.json` in the library root, `rum/` and `diagnostics/`):
  ```json
  "@absaoss-cps/ngx-ui-watchtower": ["./projects/ngx-ui-watchtower/src/public-api.ts"],
  "@absaoss-cps/ngx-ui-watchtower/rum": ["./projects/ngx-ui-watchtower/rum/src/public-api.ts"],
  "@absaoss-cps/ngx-ui-watchtower/diagnostics": ["./projects/ngx-ui-watchtower/diagnostics/src/public-api.ts"]
  ```
  The library tsconfigs `extend` the root one (`../../tsconfig.json`, and
  `../../../tsconfig.json` from `rum/` and `diagnostics/`), so the new
  repository needs a compatible root tsconfig. `rum/` and `diagnostics/`
  set `"rootDir": "../../.."`, which assumes the same depth.
- Jest config — `moduleNameMapper` for the same three entry points
  (`^@absaoss-cps/ngx-ui-watchtower$`, `…/rum$`, `…/diagnostics$`),
  plus the jsdom + jest-preset-angular setup the old repo had.
- `package.json` scripts — the old repo had
  `"build:telemetry": "npm run build && ng build --configuration=production --project=ngx-ui-watchtower"`
  and `"test:ngx-ui-watchtower": "ng test --project=ngx-ui-watchtower"`.
- ESLint and Prettier configs — the old repo's rules apply to this code (see
  "Pitfalls").

**cps-ui-kit now comes from npm.** In cps-shared-ui the kit was a sibling
library, so:

- `projects/ngx-ui-watchtower/tsconfig.lib.json` has
  `"paths": { "cps-ui-kit": ["../../dist/cps-ui-kit"] }` with a comment
  about building the kit first — **remove that mapping** (and the comment);
  the package resolves from `node_modules`.
- `build:telemetry` no longer needs to build the kit first.
- Jest mapped `^cps-ui-kit$` to the kit's source; drop that and resolve it
  from `node_modules`.
- Install `cps-ui-kit`, `aws-rum-web`, `@angular/forms` and
  `@angular/animations` as dev dependencies so the specs and the build work.
  The library's own peer ranges (`cps-ui-kit ^22.0.0`, Angular `^22.1.3`,
  `aws-rum-web ^3.2.1`) stay in `projects/ngx-ui-watchtower/package.json`.
- Check that the published cps-ui-kit version has the components and
  services the popup uses: `CpsDialogService`, `cps-expansion-panel`,
  `cps-table`, `cps-input`, `cps-autocomplete`, `cps-select`, `cps-chip`,
  `cps-button`, `cps-switch`, `cps-info-circle`, `CPS_LIVE_ANNOUNCER_SERVICE`,
  `CpsNotificationService`.

**Library metadata to update:** `projects/ngx-ui-watchtower/package.json` still
has `repository.url` and `homepage` pointing at
`https://github.com/AbsaOSS/cps-shared-ui`.

**Left behind in cps-shared-ui** (decide with the user whether to bring them;
`WATCHTOWER_LAB_PLAN.md` says which of them the lab reuses):

- The demo app integration in `projects/composition`: `app.module.ts`
  (providers, including `provideUwtTelemetryDiagnostics()`),
  `services/app-telemetry.service.ts`, `services/app-log-api.provider.ts`,
  `services/rum-credentials.provider.ts`, `services/telemetry.schema.ts`,
  and telemetry usage in several pages, each with specs. This is the only
  place the library ran in a real app.
- End-to-end tests: `playwright/composition/telemetry-diagnostics.spec.ts`
  (8 tests) and three popup accessibility tests in
  `playwright/composition/accessibility-composition.spec.ts`. They need a
  running app; without one the popup has unit and component tests only.
- `projects/ngx-ui-watchtower/telemetry-trace.txt` and
  `telemetry-trace-live.txt` were generated from the composition app (the
  old `trace:telemetry` script ran `projects/composition/src/app/telemetry-trace.capture.spec.ts`).
  Without that app they can't be regenerated — ask before deleting.
- `.vscode/settings.json` maps `**/src/**/*.spec.ts` to `typescriptreact`
  (see "Pitfalls"); bring it only if the user wants it.

## Next piece of work

Build the **Watchtower Lab**, as planned in `WATCHTOWER_LAB_PLAN.md`: a shell
app (SSR) and a Web Fragment app in the new repository, served with a mock
RUM endpoint and log backend, plus a consumer smoke app built from the packed
package, all exercised by Playwright. The user approved this plan and wants
it built in the new repository. It replaces what `composition` gave the
library in cps-shared-ui.

## Open items (offer them; don't do them unasked)

- Showing the popup inside a fragment is untested: whether the shortcut
  reaches a fragment under Web Fragments, and how the dialog renders in a
  shadow root. Recommended setup: the popup only in the shell.
- A fragment's earliest log records lack `sessionId`/`userId` until the
  shell answers. Filling them in at the shell was declined, because the
  console would then differ from what was sent.

## How the user works — follow these

- **Console output must exactly match what is sent** to the sink or log
  provider: nothing is printed that isn't sent, one line per sent event.
- **No magic numbers** — use named constants. **No `any`.** Don't change
  unrelated code or attributes.
- **Loggers are named and unique**; the service has no unnamed
  `log`/`warn`/`error`. Don't reintroduce `child()`.
- Prefer explicit opt-outs (`'noop'`, `UwtNoopLogApiProvider`) over silent
  defaults; a missing destination should fail at bootstrap.
- **Exactly one destination, never two.** OTel (or anything else) would
  _replace_ RUM, never run beside it. Don't propose fan-out or multiple
  sinks. **No OTel support is wanted now** — only the ability to swap a sink
  in later.
- **Log lines are not part of the destination.** They always go to the app's
  own backend (`UWT_LOG_API_PROVIDER`), with RUM or anything else. Don't mix
  logs into destination work — but don't drop the log provider from example
  `providers` arrays either: show it, marked unchanged.
- **Docs: straight to the point.** Instructions and decisions, not research
  narrative or "how I verified it". Short sections; cut background the
  reader doesn't need.
- Acronyms in PascalCase names are fully capitalised (`BI`, not `Bi`).
- The user often asks "why?". Answer it directly; if a change isn't needed,
  say so and recommend not doing it. Answer questions before editing, and
  ask before changing a public contract when there is a real trade-off.
- Reply in the language of the question (Russian or English).
- Reviews: report findings by severity, reproduce each one (a temporary
  test you then delete), and fix only after approval.
- Never commit unless asked. Never use `git stash`, `git rm` or other index
  manipulation — the user has rejected that.

## Verifying a change

Run all of these before saying something is done (adapt the commands to the
new repo's scripts):

- Unit tests: `npx jest projects/ngx-ui-watchtower` (822 tests at handoff).
- Lint and format: `npx eslint projects/ngx-ui-watchtower --max-warnings=0` and
  `npx prettier --check projects/ngx-ui-watchtower`.
- Types: Jest uses `isolatedModules` and does **not** type-check. Run
  `npx tsc -p <config> --noEmit` for each of the six library tsconfigs.
- The package build: `ng build --configuration=production --project=ngx-ui-watchtower`.
- After fixing a bug, mutation-check the test: undo the fix temporarily,
  confirm a test fails, then restore the file (back it up first and compare
  with `cmp`).

## Pitfalls hit in this session

- **Spec files as TSX.** The old repo's VS Code settings parse
  `*.spec.ts` as TSX, where a generic arrow like `<T>(fn: () => T) => fn()`
  reads as a JSX tag: the file turns red in the editor while tsc and Jest
  pass. Use `function f<T>()` declarations in specs. Check with:
  `node -e "const ts=require('typescript'),fs=require('fs');const f=process.argv[1];console.log(ts.createSourceFile(f,fs.readFileSync(f,'utf8'),99,true,ts.ScriptKind.TSX).parseDiagnostics.length)" <file>`
- ESLint rules that came up: `no-use-before-define` (declare a type before
  a type that references it), `no-void`, `dot-notation`,
  `lines-between-class-members`, and `no-undef` for DOM type names such as
  `NodeListOf`.
- TestBed runs app initializers on the first inject and throws there
  synchronously; it does not reject `ApplicationInitStatus.donePromise`.
- A hand-made `NgZone` stub breaks TestBed; spy on the real zone instead
  (`jest.spyOn(TestBed.inject(NgZone), 'run')`).
- When editing files with scripts, assert each match occurs exactly once,
  and diff the result afterwards — one scripted edit once cut off the end
  of a spec file.
- **Run doc snippets before trusting them.** A `providers` example that
  looked fine was missing `UWT_LOG_API_PROVIDER` and failed with `NG0201`
  as soon as the logger was used. A throwaway spec (then deleted) catches
  this.
- The full session transcript, if more detail is needed, is on the user's
  machine:
  `~/.claude/projects/-Users-madfamily-Documents-cps-shared-ui/f05e4b7e-005c-4b98-a509-f57eb8dd8276.jsonl`
