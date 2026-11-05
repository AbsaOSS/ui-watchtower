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

| Script                  | What it does                                          |
| ----------------------- | ----------------------------------------------------- |
| `npm run build`         | Builds the package (production, partial compilation)  |
| `npm run watch`         | Rebuilds on change (development)                      |
| `npm run test`          | Runs the unit tests (Jest)                            |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does         |
| `npm run typecheck`     | Type-checks every library, spec and suite tsconfig    |
| `npm run lint`          | ESLint, no warnings allowed                           |
| `npm run format`        | Formats with Prettier                                 |
| `npm run format:check`  | Checks formatting without writing                     |
| `npm run lab`           | Starts the Watchtower Lab on http://localhost:4280    |
| `npm run lab:build`     | Builds the lab's fragment and shell                   |
| `npm run e2e`           | Builds the lab and runs the Playwright suite          |
| `npm run e2e:ui`        | Opens the suite in Playwright's UI, on the last build |
| `npm run smoke`         | Packs the library and builds an app from the tarball  |

## Watchtower Lab

A testing app for the library, built from its source, so a change shows up
on save. `npm run lab` starts it on http://localhost:4280. Its shell is
rendered on the server, then hydrated. Its server (`server/server.ts`, which
`ng serve` runs too) also has a mock backend, which stands in for everything
the library talks to: the real `aws-rum-web` runs against a mock RUM broker
and dataplane, fully offline, and logs go to a mock log backend.

One page per concern: **Scenarios**, **BI events**, **Logging**,
**Identity**, **Privacy**, **Lifecycle**, **Fragment (iframe)** and **Web
Fragment** (the same second app in a plain iframe, and as a
[Web Fragment](https://web-fragments.dev) through the server's gateway, each
forwarding through the shell over the tab's own channel), **Event Inspector**
(every dock, event generators, and the `--uwt-inspector-inset-*` opt-in on
the lab's fixed header and status bar) and **On the wire**: what the mock
backend actually received.

Options, read once at startup like an app's configuration:

| Query                   | Effect                                   |
| ----------------------- | ---------------------------------------- |
| `?destination=noop`     | The noop destination instead of RUM      |
| `?telemetry=off`        | `withTelemetryEnabled(false)`            |
| `?inspector=off`        | The Event Inspector disabled             |
| `?inspector=noshortcut` | The Event Inspector without its shortcut |

The mock RUM broker's answer is set on the **On the wire** page, then applied
by reloading: `ok`, `null` (RUM off for the page), `fail` (the broker errors;
the app carries on) or `short-expiry` (credentials refresh within seconds).
The same page sets RUM's own `telemetries`: the library's default, or any of
`errors`, `performance`, `interaction`, `http` and `replay`, down to none.

### Automated tests

`npm run e2e` builds the lab and runs the suite in `playwright/` on Chromium
and WebKit: every lab page, server rendering and hydration, both fragment
pages and two tabs of one, the broker modes, RUM's telemetries, the query
options and the Event Inspector's docks and shortcut, checked against what
the mock backend received. It runs the built server on
http://localhost:4390, beside `npm run lab`. The first time, download the
browsers with `npx playwright install chromium webkit`.

## Consumer smoke test

Everything above uses the library from source. `npm run smoke` uses it as
published: it packs the built package, installs the tarball into
`projects/watchtower-consumer-smoke` — an app with no paths into the source —
and builds that app for the browser and, prerendering, for the server. It
checks the tarball's files, that all three entry points resolve with their
typings, that the page renders on the server, and that an app which never
imports `/rum` has no `aws-rum-web` in its bundle.

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
