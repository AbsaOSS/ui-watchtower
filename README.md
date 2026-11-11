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
logs, with an optional AWS CloudWatch RUM sink. It builds on
[`@absaoss-cps/ui-watchtower`](projects/ui-watchtower/README.md), the
framework-independent engine, which lives here too.

How to use the library: [projects/ngx-ui-watchtower/README.md](projects/ngx-ui-watchtower/README.md)
(also the npm page).
How it is designed: [projects/ngx-ui-watchtower/DESIGN.md](projects/ngx-ui-watchtower/DESIGN.md).

## Layout

```text
projects/ui-watchtower/
  src/          @absaoss-cps/ui-watchtower — the framework-independent engine
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
scripts/        the public API snapshot
```

The Angular package depends on the core, never the other way round.

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

| Script                  | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm run build`         | Builds both packages (production), the core first              |
| `npm run watch`         | Builds the core, then rebuilds the Angular package on change   |
| `npm run test`          | Runs the unit tests of both packages (Jest)                    |
| `npm run test:core`     | Runs the core's unit tests only: plain Jest, no Angular        |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does                  |
| `npm run typecheck`     | Builds the core, then type-checks every tsconfig and type test |
| `npm run api:check`     | Compares the built public APIs with their committed snapshots  |
| `npm run api:update`    | Writes those snapshots again, for an intended API change       |
| `npm run lint`          | ESLint, no warnings allowed                                    |
| `npm run format`        | Formats with Prettier                                          |
| `npm run format:check`  | Checks formatting without writing                              |

Three checks guard what consumers depend on:

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
  `UPDATE_WIRE_FIXTURE=1 npm test` records it again.

## Before you push

Run all of them — each catches something the others don't:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run api:check
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
