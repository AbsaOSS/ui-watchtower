# ui-watchtower

The framework-independent engine behind
[`@absaoss-cps/ngx-ui-watchtower`](https://www.npmjs.com/package/@absaoss-cps/ngx-ui-watchtower):
scenario health telemetry, business/UX events and application logs, for any
JavaScript or TypeScript application.

It imports no framework and touches no browser global when imported, so it
loads in Node, on a server and in a worker as well as in a browser.

## Install

```bash
npm install @absaoss-cps/ui-watchtower
npm install aws-rum-web   # only for @absaoss-cps/ui-watchtower/rum
npm install rxjs          # only for @absaoss-cps/ui-watchtower/rxjs
```

## Use

Create one engine per application, with its identity, where telemetry goes
and where logs go:

```ts
import {
  uwtCreateTelemetry,
  UwtNoopLogApiProvider,
  UwtNoopTelemetrySink
} from '@absaoss-cps/ui-watchtower';

const telemetry = uwtCreateTelemetry({
  identity: { application: 'cart', environment: 'prod', version: '1.4.0' },
  destination: new UwtNoopTelemetrySink(), // or your own UwtTelemetrySink
  logApi: new UwtNoopLogApiProvider(), // or your own UwtLogApiProvider
  logging: { minLevel: 'warn' } // optional overrides, per concern
});

// Scenarios: a user journey, its steps and outcome.
const scenario = telemetry.scenarios.start({ name: 'checkout' });
scenario.step('pay');
scenario.complete({ metadata: { items: 2 } });

// BI events.
telemetry.bi.track('export_clicked', { format: 'csv' });

// Logs, by named logger.
telemetry.logging.getLogger('checkout').warn('Slow payment');

// When the application, or a fragment, goes away.
telemetry.dispose();
```

Every call is fail-open: telemetry never throws into your application.
Configuration errors still throw, when the engine is created.

| Option                                    | What it does                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `identity`                                | Application, environment, version and optional `eventNamespace`, carried by every record           |
| `destination`                             | A `UwtTelemetrySink`: where scenarios, BI events and mirrored errors go                            |
| `logApi`                                  | A `UwtLogApiProvider`: where logs go, and are read back from                                       |
| `scenarios`, `logging`, `bi`, `redaction` | Overrides of each concern's defaults                                                               |
| `enabled`                                 | `false` makes everything inert: nothing is recorded, sent or logged                                |
| `document`                                | The page whose lifecycle settles and flushes telemetry; the global one by default, `null` for none |
| `report`                                  | Receives what telemetry skips or drops; nothing is reported without one                            |
| `runOutside`                              | Schedules timers outside a framework's change detection                                            |

`dispose()` stops watching the page, settles scenarios still in flight as
abandoned and flushes; the engine does nothing after that, and leaves no
listener or timer behind. The destination and log store you passed are
yours to close.

### Turning telemetry off

Keep the same calls and pass one switch:

```ts
const telemetry = uwtCreateTelemetry({ ...options, enabled: false });
```

When off, nothing is recorded, sent or logged, and nothing listens to the
page. Your code doesn't change: `start()` still returns a scenario (inert:
it records nothing and never settles), lookups find nothing, loggers do
nothing and `query()` resolves `[]`. Pass the switch on to what you created
for the engine, so that off it requests no credentials, downloads no SDK and
opens no channel: `enabled` to the RUM sink and the broadcast classes, and
`open` to `uwtConnectBroadcastChannel()`. A sink and log provider sharing a
connection ignore their own `enabled`: the connection decides.

## AWS CloudWatch RUM

The RUM destination lives in its own entry point, so the main one never
refers to `aws-rum-web`; the SDK is downloaded only once the sink starts.
Your credentials provider supplies the app monitor settings and short-lived
credentials, from your own broker:

```ts
import { UwtRumTelemetrySink } from '@absaoss-cps/ui-watchtower/rum';

const destination = new UwtRumTelemetrySink({
  identity,
  credentialsProvider: {
    async load() {
      const response = await fetch('/rum/init');
      return response.ok ? response.json() : null; // null: RUM off for the page
    }
  }
});
destination.init(); // not awaited: never delays the page

const telemetry = uwtCreateTelemetry({ identity, destination, logApi });
```

Startup is retried with backoff for five minutes, credentials are refreshed
before they expire, and events recorded before the client starts are
buffered. Without a page, as on a server, it never starts. `dispose()` stops
the client.

## Shell and fragments

In a page composed of fragments, each in its own JavaScript realm, the shell
sends everything and the fragments forward to it over a `BroadcastChannel`,
so a user is one session, not one per fragment:

```ts
// shell: records what fragments forward, through its own destination and
// log store
const host = new UwtTelemetryBroadcastHost({ sink: destination, logApi });

// each fragment: forwards everything, over one channel
const identity = { application: 'cart', environment: 'prod', version: '1.4.0' };
const connection = uwtConnectBroadcastChannel();
const telemetry = uwtCreateTelemetry({
  identity,
  destination: new UwtBroadcastTelemetrySink({ identity, connection }),
  logApi: new UwtBroadcastLogApiProvider({ connection })
});
```

Either side can be an Angular application using
`@absaoss-cps/ngx-ui-watchtower`; they exchange the same messages. Give each
fragment its own `application` name, and the shell's `eventNamespace`.

Who owns what:

| Realm          | Destination                                     | RUM client and credentials          | Log store                                         |
| -------------- | ----------------------------------------------- | ----------------------------------- | ------------------------------------------------- |
| Standalone app | Its own: `UwtRumTelemetrySink`, or another sink | The app's                           | The app's                                         |
| Shell          | Its own, plus a `UwtTelemetryBroadcastHost`     | The shell's: the only one on a page | The shell's, which also stores fragments' records |
| Fragment       | `UwtBroadcastTelemetrySink`                     | None: the shell's records for it    | None: `UwtBroadcastLogApiProvider` forwards       |

A fragment reports the shell's session and user. Whoever creates something
disposes it: dispose the engine, then the host, the sink, the log provider
and the connection, when their realm goes away.

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

Hand the engine a `UwtReporter` where you want to see what it skipped
(`'error'`) or dropped (`'warn'`), typically in development;
`uwtConsoleReporter` prints both to the console:

```ts
uwtCreateTelemetry({ ...options, report: uwtConsoleReporter });
```

Something that cannot work as configured (`'config'`) — a second broadcast
host, RUM settings of the wrong type — is reported too, and printed to the
console when there is no reporter: it is never silent.

## RxJS

`traceScenario` settles a scenario from an Observable's outcome. It lives in
its own entry point, so the main one never loads RxJS:

```ts
import { traceScenario } from '@absaoss-cps/ui-watchtower/rxjs';

customers$.pipe(traceScenario(scenario)).subscribe();
```

## Writing an adapter for another framework

`@absaoss-cps/ngx-ui-watchtower` is one adapter. Another framework's needs
only the public entry points above: no deep import, no private file.

1. **One engine per application, or per fragment.** Create it with
   `uwtCreateTelemetry` at startup, from the framework's configuration, and
   share it through the framework's context or dependency injection, never
   one per component. If the framework resolves each concern on its own, as
   Angular's DI does, construct `UwtScenarioTelemetry`, `UwtBITelemetry` and
   `UwtLogTelemetry` instead, from `uwtResolveTelemetryConfig(overrides)`,
   one destination and one log store.
2. **The platform.** Pass `document: null` when rendering on a server, and
   `runOutside` if the framework waits for pending timers before it is
   stable, as Angular's zone does.
3. **Failures.** Pass a `report`, such as `uwtConsoleReporter` in
   development. Telemetry calls never throw; `uwtCreateTelemetry` does, when
   the identity, destination or log store is missing.
4. **Reactive APIs.** Adapt `scenarios.onSettled(listener)`, which returns
   an unsubscribe function, to the framework's primitive: an Observable, a
   signal, a store.
5. **Destinations.** Accept any `UwtTelemetrySink`, and offer the core's:
   the RUM sink, started with an unawaited `init()`; for a fragment, the
   broadcast sink and log provider sharing one `uwtConnectBroadcastChannel()`;
   for a shell, a `UwtTelemetryBroadcastHost`. Pass each the engine's
   `enabled`, and the shared connection `open: enabled`.
6. **Teardown.** When the application or fragment is destroyed, dispose the
   engine and then what you created for it. Every `dispose()` can be called
   more than once.
7. **Names.** Re-export the four registries, so applications augment your
   package's module path:

   ```ts
   export type {
     UwtBIEventNames,
     UwtLoggerNames,
     UwtScenarioNames,
     UwtScenarioSteps
   } from '@absaoss-cps/ui-watchtower';
   ```

8. **The dependency.** Depend on `@absaoss-cps/ui-watchtower` with a caret
   range, as a dependency rather than a peer, so installing the adapter
   installs the core.

## API

| Group         | Exports                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine        | `uwtCreateTelemetry`, `UwtTelemetry`, `UwtTelemetryOptions`, `UwtTelemetryDocument`                                                                                   |
| Concerns      | `UwtScenarioTelemetry`, `UwtBITelemetry`, `UwtLogTelemetry` and their options, for an adapter composing them itself                                                   |
| Configuration | `UwtTelemetryIdentity`, the per-concern config types, `UWT_DEFAULT_TELEMETRY_CONFIG`, `uwtResolveTelemetryConfig`                                                     |
| Models        | scenario, step, BI event and log record types; `UWT_LOG_LEVEL_ORDER`, `UWT_TELEMETRY_EVENT_TYPE`, `uwtEventTypes`                                                     |
| Names         | `UwtScenarioNames`, `UwtScenarioSteps`, `UwtBIEventNames`, `UwtLoggerNames` and their `Uwt*Name` types                                                                |
| Scenarios     | `UwtScenario`                                                                                                                                                         |
| Contracts     | `UwtTelemetrySink` and `UwtNoopTelemetrySink`; `UwtLogApiProvider`, `UwtLogQuery` and `UwtNoopLogApiProvider`                                                         |
| Broadcast     | `UwtTelemetryBroadcastHost`, `UwtBroadcastTelemetrySink`, `UwtBroadcastLogApiProvider`, `uwtConnectBroadcastChannel`, `UWT_DEFAULT_BROADCAST_CHANNEL`                 |
| Redaction     | `uwtRedactMetadata`, `uwtScrubString`, `uwtNormalizeError`, `uwtRedactConfigFor`, `UwtRedactConfig`, `UWT_DEFAULT_REDACT_CONFIG`, `UWT_REDACTED`                      |
| Utilities     | `uwtClassifyTelemetryEvent`, `uwtIsDebugEnabled`, `uwtMarkSessionStart`, `uwtSessionElapsed`, `uwtUuid`, `uwtSafe*`, `uwtReport`, `uwtConsoleReporter`, `UwtReporter` |
| `/rxjs`       | `traceScenario`, `UwtTraceScenarioOptions`                                                                                                                            |
| `/rum`        | `UwtRumTelemetrySink` and its options; `UwtRumCredentialsProvider`, `UwtRumBootstrap`, `UwtRumAppMonitorConfig`, `UwtRumCredentials`                                  |

## Versions

This package and `@absaoss-cps/ngx-ui-watchtower` are released together,
always at the same version. The Angular package depends on this one, never
the other way round, and installs it for you.

## License

Apache-2.0
