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
  src/          main entry point — @absaoss-cps/ngx-ui-watchtower
  rum/          secondary entry point — @absaoss-cps/ngx-ui-watchtower/rum
  type-tests/   consumer type tests
  README.md     usage guide, published to npm
  DESIGN.md     full design
  package.json  the published package's manifest
docs/           ADAPTERS.md: how to write a framework adapter
scripts/        the public API snapshot, the packaging smoke test, and publishing
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
| `npm run test`          | Runs the unit tests of both packages (Jest), then `test:release` |
| `npm run test:core`     | Runs the core's unit tests only: plain Jest, no Angular          |
| `npm run test:release`  | Tests the publish script and the release workflow's wiring       |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does; fails below 90%   |
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

**A failed publish** stops before the next package, so the Angular package
never depends on a core that isn't on npm. To finish a partial release, run
the workflow again on the release tag:

```bash
gh workflow run release-please.yml --ref ngx-ui-watchtower-v<version>
```

[`scripts/publish-packages.mjs`](scripts/publish-packages.mjs) publishes a
package only if its release tag points at that commit and npm doesn't have
the version yet; any other answer from npm stops it.

**The core's first release is 0.1.0, and its first publish is by hand.** The
core's `initial-version` in `release-please-config.json` sets that version.
npm sets up trusted publishing only for a package that exists. Before the
first release PR that releases the core is merged, an `@absaoss-cps` owner
publishes the core from that PR's branch:

```bash
npm login
git fetch origin
git switch release-please--branches--main
npm ci && npm run build
npm publish dist/ui-watchtower
```

Then, on npmjs.com, in the package's settings, add the trusted publisher the
Angular package has: GitHub Actions, `AbsaOSS/ui-watchtower`, workflow
`release-please.yml`. After the merge, publishing finds 0.1.0 on npm, skips
it, and publishes the Angular package. If the release PR is merged first,
publishing stops at the core; publish it as above from the
`ui-watchtower-v0.1.0` tag, then run the workflow on the release tag.

`bootstrap-sha` in `release-please-config.json` is the commit tagged
`v0.4.0`: it keeps what that release shipped out of the first changelogs,
and is read only until both packages have a release. If another `v` release
reaches `main` first, set it to that release's commit. `npm run release:check`
compares the two.

`npm run release:check` replays releases through the Release Please version
the workflow runs, on this config:

- the first release, with the core at 0.1.0;
- an Angular-only change releasing only the Angular package;
- a core change also releasing the Angular package, with its dependency moved;
- merging creating the tags publishing looks for.

It installs Release Please, so it needs a network.

## License

Apache License 2.0.
