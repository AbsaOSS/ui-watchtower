<p align="center">
  <img src="assets/logo/logo-stacked-light.svg#gh-light-mode-only" alt="UI Watchtower" width="280">
  <img src="assets/logo/logo-stacked-dark.svg#gh-dark-mode-only" alt="UI Watchtower" width="280">
</p>

# UI Watchtower

Telemetry for frontend applications, in three parts:

- **Scenarios** — did a user journey or a workflow succeed, and how long did
  it take?
- **BI events** — which features are used?
- **Logs** — what exactly happened?

Events go to AWS CloudWatch RUM or another destination you choose; logs go
to a backend you provide.

It comes as two packages, each with its own version:

| Package                                                                                          | Use it in                                                                                                                                              | Guide                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| [`@absaoss-cps/ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ui-watchtower)         | Any frontend: plain JavaScript or TypeScript, or any framework. Framework adapters are built on it ([how](docs/ADAPTERS.md)).                          | [README](projects/ui-watchtower/README.md)     |
| [`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower) | Angular applications. A thin adapter over `@absaoss-cps/ui-watchtower`: Angular providers, injectable services and Observables around the same engine. | [README](projects/ngx-ui-watchtower/README.md) |

Each guide is also the package's npm page. How it is designed:
[projects/ngx-ui-watchtower/DESIGN.md](projects/ngx-ui-watchtower/DESIGN.md).

## Layout

```text
projects/ui-watchtower/
  src/          @absaoss-cps/ui-watchtower — the framework-independent engine
  rxjs/         secondary entry point — @absaoss-cps/ui-watchtower/rxjs
  rum/          secondary entry point — @absaoss-cps/ui-watchtower/rum
  type-tests/   consumer type tests, without a framework
  README.md     usage guide, published to npm
  package.json  the published package's manifest
projects/ngx-ui-watchtower/
  src/              main entry point — @absaoss-cps/ngx-ui-watchtower
  rum/              secondary entry point — @absaoss-cps/ngx-ui-watchtower/rum
  event-inspector/  secondary entry point — @absaoss-cps/ngx-ui-watchtower/event-inspector
  type-tests/       consumer type tests
  README.md         usage guide, published to npm
  DESIGN.md         full design
  package.json      the published package's manifest
projects/watchtower-lab/           the Watchtower Lab: a testing app, never published
  server/                          its server: mock backend, fragment gateway, SSR
projects/watchtower-lab-fragment/  the lab's embedded application: a second app it embeds
playwright/                        the lab's end-to-end suite (Playwright)
docs/                              ADAPTERS.md: how to write a framework adapter
scripts/                           the public API snapshot and the packaging smoke test
```

The Angular package depends on the core, never the other way round. Each
package has its own version; a core release also releases the Angular
package, with its dependency moved (see [Releases](#releases)).

## Getting started

Requires Node.js 22 or later.

```bash
npm install
npm run test
npm run build
```

The packages are built to `dist/ui-watchtower` and `dist/ngx-ui-watchtower`,
the core first: the Angular package compiles against the built core, as an
application does. Tests and the typecheck read the core's source.

## Scripts

| Script                  | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run build`         | Builds both packages (production), the core first                |
| `npm run watch`         | Builds the core, then rebuilds the Angular package on change     |
| `npm run test`          | Runs the unit tests of both packages (Jest)                      |
| `npm run test:core`     | Runs the core's unit tests only: plain Jest, no Angular          |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does; fails below 90%   |
| `npm run typecheck`     | Builds the core, then type-checks every tsconfig and type test   |
| `npm run api:check`     | Builds both packages, then compares their public APIs            |
| `npm run api:update`    | Builds both packages, then rewrites their snapshots              |
| `npm run smoke`         | Installs the built packages, packed, into throwaway consumers    |
| `npm run lab`           | Starts the Watchtower Lab on http://localhost:4280               |
| `npm run lab:build`     | Builds the lab's fragment and shell                              |
| `npm run e2e`           | Builds the lab and runs the Playwright suite                     |
| `npm run e2e:ui`        | Builds the lab, and opens the suite in Playwright's UI           |
| `npm run lint`          | ESLint, no warnings allowed                                      |
| `npm run format`        | Formats with Prettier                                            |
| `npm run format:check`  | Checks formatting without writing                                |

Four checks guard what consumers depend on:

- **Type tests** (`type-tests/` in each package) compile a consumer that uses
  every public export, and one that augments the name registries: registered
  names accepted, others rejected, `string` while nothing is registered. The
  Angular package's are compiled by the Angular compiler, the core's by plain
  `tsc`.
- **The API snapshots** (`public-api.snapshot.json` in each package) record
  every export of the built packages with its members and signatures. After an intended change, run `npm run api:update` and review
  the diff.
- **The broadcast wire fixture**
  (`projects/ngx-ui-watchtower/src/lib/sinks/uwt-broadcast/uwt-broadcast.wire.fixture.json`) records
  every message a shell and a fragment exchange. Shells and fragments are
  deployed separately, so it changes only with a deliberate protocol change:
  `UPDATE_WIRE_FIXTURE=1 npm test` records it again. Every pairing of an
  Angular or framework-free shell and fragment is held to it.
- **The smoke test** (`scripts/smoke/`) packs both packages and installs the
  tarballs, outside this workspace, into a framework-free Node consumer (no
  Angular, RxJS or `aws-rum-web` installed), a TypeScript one (the core's
  type tests, and a project without the DOM typings), and an unchanged
  Angular application, prerendered as a fragment without `aws-rum-web`, as a
  shell with `/rum`, and with the Event Inspector. It installs from the
  registry, so it needs a network.

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
it sent, ticked once the mock backend has it. **Embedded apps**: **Iframe**
and **Web Fragment** (the same second app in a plain iframe, and
as a [Web Fragment](https://web-fragments.dev) through the server's gateway,
each forwarding through the shell over the tab's own channel). **Tools**:
**Event Inspector** (every dock, showing the one it is in, event generators,
and the `--uwt-inspector-inset-*` opt-in on the lab's fixed header and status
bar) and **On the wire**: what the mock backend actually received.

**Settings**, opened from the header's gear, and closed by it again, sets
up the run every page shares. It takes the whole page, the lab's nav giving way to its own: a page
per section, listed beside it by area, each saying how it applies. Closing
it (✕, or the gear) goes back to the page it was opened from, even after the
reload that applies its changes. Leaving it, however, the logo and Back too,
asks first when changes not applied would be lost.
**Library**: App identity, Delivery, Scenarios, BI events, Logging, Privacy &
redaction and Event Inspector. **Mock backend**: RUM broker and App monitor.
**Diagnostics**: Debug flags, which apply at once. **Advanced**: Configuration
as JSON, and the Effective configuration. A change waits, from whichever
section, in a bar listing them all, until they are applied together with one
reload, or discarded. A setting says what it does, from the library's
documentation (and aws-rum-web's, for the app monitor), and where it stands:
**Not applied**, with Undo, or **Modified** from the lab's default, with the
default and a Reset that waits to be applied too (a debug flag resets at
once); the list counts each section's modified settings. The **Overview**
lists both, to undo or reset each, or to reset all of them at once.
**Find a setting**, or `/`, finds one by its name, its name in the JSON or
what it does, and shows it in its section. On a narrow screen the sections
fold into a picker.

The header's logo and name lead back to the start page, **Scenarios**.
The header's chips show how this load runs, each a link to its setting;
where the broker is set differently for the next one, its chip says so:
`broker: ok → null after reload`. On a narrow screen, or beside a docked
pane, the chips fold behind **Run settings**, and the page list behind
**Pages**.
The header's **Signed in** or **Signed out** only shows the state:
**Identity** and the fragments both sign in and out.

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
with a control for each setting — switches, numbers, lists to pick from, lists
of patterns, and editors for logger levels and the inspector's shortcuts — and
the JSON itself, and refuses a section, setting or type the library doesn't
have.

The mock RUM broker's answer is set in **Settings** too, under **RUM
broker**:

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
and, under **App monitor**, the broker's app monitor config: controls for the
settings most worth trying (`sessionSampleRate`, `sessionEventLimit`,
`dispatchInterval`, `allowCookies`, `enableXRay`, `disableAutoPageView`,
`recordResourceUrl` and the pages to include or exclude), and a JSON object
laid over it for the rest, such as `{ "sessionSampleRate": 0 }`.

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

## Before you push

Run all of them — each catches something the others don't:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run api:check
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
— don't publish by hand. Each package has its own version and changelog, and
is released when it changes:

| A change to         | Releases                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| The Angular package | The Angular package                                                                        |
| The core            | The core, and a patch of the Angular package that moves its dependency to `^` the new core |
| Both                | Each, with its own bump                                                                    |

1. Every push to `main` updates one release PR, for every package with
   changes. `feat` bumps the minor version, `fix`, `perf` and `revert` the
   patch; until 1.0, a breaking change bumps the minor. Other types don't
   trigger a release.
2. The release PR holds each released package's version bump and
   `CHANGELOG.md` entry. When the core is released, Release Please's
   `node-workspace` plugin also moves the Angular package's dependency on the
   core and releases it as a patch, so it always depends on the core it was
   built against.
3. Merging it tags each release, `ui-watchtower-v<version>` or
   `ngx-ui-watchtower-v<version>` (until 0.4.0, the Angular package's tags
   were `v<version>`), and creates its GitHub release. GitHub Actions then
   publishes what was released, the core before the Angular package, through
   trusted publishing — no npm token.

**A failed publish** stops before the Angular package, so it never depends
on a core that isn't on npm. To finish a partial release, use **Re-run failed
jobs** on that workflow run: each package's step skips a version npm already
has.

**The core's first release is 0.1.0**, set by its `initial-version` in
`release-please-config.json`, and published by the workflow like every
release. npm adds a trusted publisher only to a package that exists, so
before the first release PR that releases the core is merged, an
`@absaoss-cps` owner publishes a placeholder, `0.0.0`, by hand:

```bash
npm login
mkdir ui-watchtower-placeholder && cd ui-watchtower-placeholder
echo '{ "name": "@absaoss-cps/ui-watchtower", "version": "0.0.0", "description": "Placeholder: the first release is 0.1.0", "license": "Apache-2.0" }' > package.json
npm publish --access public
```

Then, on npmjs.com, in the package's settings, add the trusted publisher the
Angular package has: GitHub Actions, `AbsaOSS/ui-watchtower`, workflow
`release-please.yml`. Once the workflow has published 0.1.0, deprecate the
placeholder:

```bash
npm deprecate @absaoss-cps/ui-watchtower@0.0.0 "Placeholder, use 0.1.0 or later"
```

If the release PR is merged first, publishing the core fails, and the
Angular package isn't published: add the trusted publisher, then re-run the
failed job.

`bootstrap-sha` in `release-please-config.json` is the commit tagged
`v0.4.0`: it keeps what that release shipped out of the first changelogs,
and is read only until both packages have a release. If another `v` release
reaches `main` first, set it to that release's commit. That commit is also
tagged `ngx-ui-watchtower-v0.4.0`, in the new format, so the Angular
package's first changelog compares from a tag that exists.

## License

Apache License 2.0.
