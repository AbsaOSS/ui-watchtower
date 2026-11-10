<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo/logo-stacked-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo/logo-stacked-light.svg">
    <img src="assets/logo/logo-stacked-auto.svg" alt="UI Watchtower" width="280">
  </picture>
</p>

# UI Watchtower

Source of [`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower),
a telemetry library for Angular apps: scenarios (user end-to-end journeys or specific functional workflows through an app), BI events and
logs, with an optional AWS CloudWatch RUM sink. It builds on
[`@absaoss-cps/ui-watchtower`](projects/ui-watchtower/README.md), the
framework-independent engine, which lives here too.

How to use the library: [projects/ngx-ui-watchtower/README.md](projects/ngx-ui-watchtower/README.md)
(also the npm page). Without Angular, and to write an adapter for another
framework: [projects/ui-watchtower/README.md](projects/ui-watchtower/README.md).
How it is designed: [projects/ngx-ui-watchtower/DESIGN.md](projects/ngx-ui-watchtower/DESIGN.md).

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
  src/          main entry point — @absaoss-cps/ngx-ui-watchtower
  rum/          secondary entry point — @absaoss-cps/ngx-ui-watchtower/rum
  type-tests/   consumer type tests
  README.md     usage guide, published to npm
  DESIGN.md     full design
  package.json  the published package's manifest
scripts/        the public API snapshot, the packaging smoke test, and publishing
```

The Angular package depends on the core, never the other way round. Both
share one version and are released together (see [Releases](#releases)).

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
| `npm run test`          | Runs the unit tests of both packages (Jest), then `test:release` |
| `npm run test:core`     | Runs the core's unit tests only: plain Jest, no Angular          |
| `npm run test:release`  | Tests the publish script and the release workflow's wiring       |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does                    |
| `npm run typecheck`     | Builds the core, then type-checks every tsconfig and type test   |
| `npm run api:check`     | Compares the built public APIs with their committed snapshots    |
| `npm run api:update`    | Writes those snapshots again, for an intended API change         |
| `npm run smoke`         | Installs the built packages, packed, into throwaway consumers    |
| `npm run release:check` | Replays releases through Release Please on the release config    |
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
  Angular application, prerendered as a fragment without `aws-rum-web` and as
  a shell with `/rum`. It installs from the registry, so it needs a network.

## Before you push

Run all of them — each catches something the others don't:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run api:check
npm run smoke
npm run release:check
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
— don't publish by hand. Both packages share one version and always release
together: a change to either releases both.

1. Every push to `main` updates one release PR. `feat` bumps the minor
   version, `fix`, `perf` and `revert` the patch; until 1.0, a breaking change
   bumps the minor. Other types don't trigger a release.
2. The release PR holds both version bumps, each package's `CHANGELOG.md`
   entry, and the Angular package's dependency on the core, moved to `^` the
   new version.
3. Merging it tags both releases, `ui-watchtower-v<version>` and
   `ngx-ui-watchtower-v<version>` (until 0.4.0, the Angular package's tags
   were `v<version>`), and creates their GitHub releases. GitHub Actions then
   publishes the core, and only after it the Angular package, through trusted
   publishing — no npm token.

**A failed publish** stops before the next package, so the Angular package
never depends on a core that isn't on npm. To finish a partial release, run
the workflow again on the release tag:

```bash
gh workflow run release-please.yml --ref ngx-ui-watchtower-v<version>
```

[`scripts/publish-packages.mjs`](scripts/publish-packages.mjs) publishes a
package only if its release tag points at that commit and npm doesn't have
the version yet; any other answer from npm stops it.

**The core's first publish is by hand.** npm sets up trusted publishing only
for a package that exists. Before the first release PR is merged, an
`@absaoss-cps` owner publishes `@absaoss-cps/ui-watchtower` once, at the
version in `.release-please-manifest.json`, from `main`:

```bash
npm login
npm ci && npm run build
npm publish dist/ui-watchtower
```

Then, on npmjs.com, in the package's settings, add the trusted publisher the
Angular package has: GitHub Actions, `AbsaOSS/ui-watchtower`, workflow
`release-please.yml`. If the release PR is merged first, publishing stops at
the core; do the above, then run the workflow on the release tag.

`bootstrap-sha` in `release-please-config.json` is the commit tagged
`v0.4.0`: it keeps what that release shipped out of the first linked
changelogs, and is read only until both packages have a release. If another
`v` release reaches `main` first, set it to that release's commit.
`npm run release:check` compares the two.

`npm run release:check` replays releases through the Release Please version
the workflow runs, on this config: one changed package releases both, the
dependency moves with them, and merging creates the tags publishing looks
for. It installs Release Please, so it needs a network.

## License

Apache License 2.0.
