# ui-watchtower

The framework-independent engine behind
[`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower):
scenario health telemetry, business/UX events and application logs, for any
JavaScript or TypeScript application.

> **Work in progress.** The engine is moving here from the Angular package in
> stages: the models, scenarios, redaction and contracts are here; the engine
> that wires them together is next. Until it lands, use
> `@absaoss-cps/ngx-ui-watchtower`; it installs this package by itself.

It imports no framework and touches no browser global when imported, so it
loads in Node, on a server and in a worker as well as in a browser.

## Install

```bash
npm install @absaoss-cps/ui-watchtower
```

## Declare your names

Scenario, step, event and logger names are typed, so a typo is a compile
error instead of a broken dashboard. Declare them once:

```ts
// src/telemetry.schema.ts
declare module '@absaoss-cps/ui-watchtower' {
  interface UwtScenarioNames {
    'load-customers': true;
  }
  interface UwtScenarioSteps {
    fetch: true;
  }
  interface UwtBIEventNames {
    export_clicked: true;
  }
  interface UwtLoggerNames {
    checkout: true;
  }
}

export {};
```

Until you declare any, plain strings are accepted. An Angular application
augments `@absaoss-cps/ngx-ui-watchtower` instead, which re-exports these
registries: either module path reaches the same ones.

## Seeing what telemetry skips

Telemetry never throws into your application, and the engine prints nothing
by itself. Hand it a `UwtReporter` where you want to see what it skipped or
dropped, typically in development:

```ts
import { UwtReporter } from '@absaoss-cps/ui-watchtower';

const report: UwtReporter = (level, message, ...details) =>
  console[level](`[my-app] ${message}`, ...details);
```

## API

| Group         | Exports                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuration | `UwtTelemetryIdentity`, `UwtScenarioTelemetryConfig`, `UwtLogConfig`, `UwtBITelemetryConfig`, `UWT_DEFAULT_TELEMETRY_CONFIG`                     |
| Models        | scenario, step, BI event and log record types; `UWT_LOG_LEVEL_ORDER`, `UWT_TELEMETRY_EVENT_TYPE`, `uwtEventTypes`                                |
| Names         | `UwtScenarioNames`, `UwtScenarioSteps`, `UwtBIEventNames`, `UwtLoggerNames` and their `Uwt*Name` types                                           |
| Scenarios     | `UwtScenario`                                                                                                                                    |
| Contracts     | `UwtTelemetrySink` (a destination), `UwtLogApiProvider` and `UwtLogQuery` (a log backend)                                                        |
| Redaction     | `uwtRedactMetadata`, `uwtScrubString`, `uwtNormalizeError`, `uwtRedactConfigFor`, `UwtRedactConfig`, `UWT_DEFAULT_REDACT_CONFIG`, `UWT_REDACTED` |
| Utilities     | `uwtClassifyTelemetryEvent`, `uwtIsDebugEnabled`, `uwtMarkSessionStart`, `uwtUuid`, `UwtReporter`                                                |

## License

Apache-2.0
