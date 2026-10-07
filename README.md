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
  README.md     usage guide, published to npm
  DESIGN.md     full design
  package.json  the published package's manifest
```

## Getting started

Requires Node.js 22 or later.

```bash
npm install
npm test
npm run build
```

The package is built to `dist/ngx-ui-watchtower`.

## Scripts

| Script                 | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run build`        | Builds the package (production, partial compilation) |
| `npm run watch`        | Rebuilds on change (development)                     |
| `npm test`             | Runs the unit tests (Jest)                           |
| `npm run typecheck`    | Type-checks every library and spec tsconfig          |
| `npm run lint`         | ESLint, no warnings allowed                          |
| `npm run format`       | Formats with Prettier                                |
| `npm run format:check` | Checks formatting without writing                    |

## Before you push

Run all of them — each catches something the others don't:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Publishing

The package is public in the `@absaoss-cps` npm organization; publishing needs rights in it.

```bash
npm run build
cd dist/ngx-ui-watchtower
npm publish
```

## License

Apache License 2.0.
