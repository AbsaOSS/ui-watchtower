<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/logo-stacked-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo/logo-stacked-light.svg">
    <img src="assets/logo/logo-stacked-auto.svg" alt="Angular UI Watchtower" width="280">
  </picture>
</p>

# Angular UI Watchtower

Source of [`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower),
a telemetry library for Angular apps: scenarios (user end-to-end journeys or specific functional workflows through an app), BI events and
logs, with an optional AWS CloudWatch RUM sink.

How to use the library: [projects/ngx-ui-watchtower/README.md](projects/ngx-ui-watchtower/README.md)
(also the npm page).
How it is designed: [projects/ngx-ui-watchtower/DESIGN.md](projects/ngx-ui-watchtower/DESIGN.md).

## Layout

```text
projects/ngx-ui-watchtower/
  src/              main entry point — @absaoss-cps/ngx-ui-watchtower
  rum/              secondary entry point — @absaoss-cps/ngx-ui-watchtower/rum
  event-inspector/  secondary entry point — @absaoss-cps/ngx-ui-watchtower/event-inspector
  README.md         usage guide, published to npm
  DESIGN.md         full design
  package.json      the published package's manifest
projects/watchtower-lab/             the Watchtower Lab: a testing app, never published
  server/                            its server: mock backend, fragment gateway, SSR
projects/watchtower-lab-fragment/    the lab's fragment: a second app it composes
projects/watchtower-consumer-smoke/  a minimal app that installs the packed library
playwright/                          the lab's end-to-end suite (Playwright)
```

## Getting started

Requires Node.js 22 or later.

```bash
npm install
npm run test
npm run build
```

The package is built to `dist/ngx-ui-watchtower`.

## Scripts

| Script                  | What it does                                           |
| ----------------------- | ------------------------------------------------------ |
| `npm run build`         | Builds the package (production, partial compilation)   |
| `npm run watch`         | Rebuilds on change (development)                       |
| `npm run test`          | Runs the unit tests (Jest)                             |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does          |
| `npm run typecheck`     | Type-checks every library, spec and suite tsconfig     |
| `npm run lint`          | ESLint, no warnings allowed                            |
| `npm run format`        | Formats with Prettier                                  |
| `npm run format:check`  | Checks formatting without writing                      |
| `npm run lab`           | Starts the Watchtower Lab on http://localhost:4280     |
| `npm run lab:build`     | Builds the lab's fragment and shell                    |
| `npm run e2e`           | Builds the lab and runs the Playwright suite           |
| `npm run e2e:ui`        | Builds the lab, and opens the suite in Playwright's UI |
| `npm run smoke`         | Packs the library and builds an app from the tarball   |

## Watchtower Lab

A testing app for the library, built from its source, so a change shows up
on save. `npm run lab` starts it on http://localhost:4280. Its shell is
rendered on the server, then hydrated. Its server (`server/server.ts`, which
`ng serve` runs too) also has a mock backend, which stands in for everything
the library talks to: the real `aws-rum-web` runs against a mock RUM broker
and dataplane, fully offline, and logs go to a mock log backend.

One page per concern, in three groups. **Library**: **Scenarios**, **BI
events**, **Logging**, **Identity**, **Privacy** and **Lifecycle**, each with
a **Results** column beside its buttons — the page's own readout, and what
it sent, ticked once the mock backend has it. **Composition**: **Fragment
(iframe)** and **Web Fragment** (the same second app in a plain iframe, and
as a [Web Fragment](https://web-fragments.dev) through the server's gateway,
each forwarding through the shell over the tab's own channel). **Tools**:
**Event Inspector** (every dock, showing the one it is in, event generators,
and the `--uwt-inspector-inset-*` opt-in on the lab's fixed header and status
bar), **On the wire**: what the mock backend actually received, and
**Settings**: the library's settings and the mock broker's answer, applied
together with one reload, the debug flags, and the settings in effect.

The header's chips show how this load runs; where the broker is set
differently for the next one, its chip says so: `broker: ok → null after
reload`. On a narrow screen, or beside a docked pane, the chips fold behind
**Run settings**, and the page list behind **Pages**.
The header's **Signed in** or **Signed out** is a link to **Identity**.

Options, read once at startup like an app's configuration, and kept in the
address from the start page and through the page links, so a reload keeps
them too:

| Query                   | Effect                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `?destination=noop`     | The noop destination instead of RUM                                                           |
| `?destination=custom`   | The lab's own sink, through `provideUwtTelemetryDestination`                                  |
| `?telemetry=off`        | Telemetry off, through `withTelemetryEnabled`'s factory form                                  |
| `?channel=shared`       | The shell on the default broadcast channel, shared by every tab: their hosts elect one leader |
| `?inspector=off`        | The Event Inspector disabled                                                                  |
| `?inspector=noshortcut` | The Event Inspector without its shortcut                                                      |
| `?config=<JSON>`        | Library settings laid over the lab's own                                                      |

`?config=` takes `identity` (`eventNamespace`), `scenarios`, `logging`, `bi`,
`redaction` and `inspector`, each as its `with…` function or
`provideUwtEventInspector` takes it, in JSON: a pattern is a `RegExp` source,
and the one value transform is `mask-order-ids`. One more, `lab`, is the
lab's own: `{ "logBatching": true }` makes its log provider batch, and send
when the library flushes it. For example
`?config={"scenarios":{"emitLifecycleEvents":true}}`. **Settings** edits it,
with switches for the common options, and refuses a section, setting or
type the library doesn't have.

The mock RUM broker's answer is set on the **Settings** page too:

| Mode                        | The broker                                                   |
| --------------------------- | ------------------------------------------------------------ |
| `ok`                        | Answers normally                                             |
| `null`                      | Turns RUM off for the page                                   |
| `fail`                      | Errors; the app carries on                                   |
| `short-expiry`              | Gives credentials that are refreshed within seconds          |
| `flaky`                     | Fails twice, then answers: the sink retries, then catches up |
| `invalid`                   | Sends a pattern as a string: the sink doesn't start RUM      |
| `null-on-refresh`           | Turns RUM off at the first refresh                           |
| `no-credentials-on-refresh` | Refreshes without credentials: the sink keeps the old ones   |

It also sets RUM's own `telemetries` (the library's default, or any of
`errors`, `performance`, `interaction`, `http` and `replay`, down to none),
and a JSON object laid over the broker's app monitor config, such as
`{ "sessionSampleRate": 0 }`.

### Automated tests

`npm run e2e` builds the lab and runs the suite in `playwright/` on Chromium
and WebKit, checking what the mock backend received against what each page
sends. It covers every control on every lab page: the whole scenario API and
`traceScenario`, BI events, logging and log queries, identity, redaction,
flushing, server rendering and hydration, both fragment pages, two tabs on
their own channels or one shared, a custom destination, every broker mode
and RUM's start-up and refresh, RUM's telemetries, the library's settings
through `?config=`, the debug flags, and the Event Inspector's docks,
shortcut, pause, kinds, search, filters, export, paging, resizing, links
between an error and its log event, and events kept from before opening —
and the lab's own frame: results beside the buttons, the header and nav
folding when narrow, and no page wider than a phone. It also runs axe-core's
WCAG 2.2 A and AA rules on every lab page and on the Event Inspector with its
Export menu and filter help open, measures the contrast of its coloured
text, and checks its states under forced colours. Internal edge cases —
timers longer than 24 days, giving up after five minutes, no Web Locks or
storage, message validation, start-up errors — are left to the unit tests.

It runs the built server on http://localhost:4390, beside `npm run lab`,
starting its own each time: one already on that port stops it, rather than
serving an older build. The first time, download the browsers with
`npx playwright install chromium webkit`.

## Consumer smoke test

Everything above uses the library from source. `npm run smoke` uses it as
published: it packs the built package, then sets up
`projects/watchtower-consumer-smoke` on its own, in a temporary folder
outside the workspace, with its own `package.json` (the workspace's
versions) and `angular.json`, and installs it with `npm install`, peer
checks and all. Nothing comes from the workspace, so a peer the package
leaves out or mis-ranges fails as it would for an app. It builds that app
for the browser and, prerendering, for the server, and checks the tarball's
files, that all three entry points resolve with their typings, that the page
renders on the server, and that an app which never imports `/rum` has no
`aws-rum-web` in its bundle. It needs the npm registry, and keeps the folder
when a check fails.

## Before you push

Run all of them — each catches something the others don't:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run e2e
npm run smoke
```

CI runs the same checks on every pull request and every push to `main`.

## Pull requests

PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/),
for example `feat: add scenario timeout option` or `fix: flush logs on page hide`.
Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`. A check enforces it; the `ignore-cc-check`
label skips it.

Squash-merge pull requests: the title then becomes the commit message on
`main`, and releases are built from those messages.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please)
— don't publish by hand.

1. Every push to `main` updates a release PR. `feat` bumps the minor version,
   `fix`, `perf` and `revert` the patch; until 1.0, a breaking change bumps
   the minor. Other types don't trigger a release.
2. The release PR holds the version bump and the `CHANGELOG.md` entry.
3. Merging it tags the release, creates the GitHub release and publishes the
   package to npm from GitHub Actions through trusted publishing — no npm
   token.

## License

Apache License 2.0.
