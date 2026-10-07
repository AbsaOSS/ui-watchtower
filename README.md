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
  src/          main entry point — @absaoss-cps/ngx-ui-watchtower
  rum/          secondary entry point — @absaoss-cps/ngx-ui-watchtower/rum
  diagnostics/  secondary entry point — @absaoss-cps/ngx-ui-watchtower/diagnostics
  README.md     usage guide, published to npm
  DESIGN.md     full design
  package.json  the published package's manifest
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

| Script                  | What it does                                         |
| ----------------------- | ---------------------------------------------------- |
| `npm run build`         | Builds the package (production, partial compilation) |
| `npm run watch`         | Rebuilds on change (development)                     |
| `npm run test`          | Runs the unit tests (Jest)                           |
| `npm run test:coverage` | Runs the unit tests with coverage, as CI does        |
| `npm run typecheck`     | Type-checks every library and spec tsconfig          |
| `npm run lint`          | ESLint, no warnings allowed                          |
| `npm run format`        | Formats with Prettier                                |
| `npm run format:check`  | Checks formatting without writing                    |

## Before you push

Run all of them — each catches something the others don't:

```bash
npm run test
npm run typecheck
npm run lint
npm run format:check
npm run build
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
