# Writing a framework adapter

`@absaoss-cps/ui-watchtower` works on its own, in any frontend. An adapter
is optional: it only makes the library feel native to one framework.
[`@absaoss-cps/ngx-ui-watchtower`](../projects/ngx-ui-watchtower/README.md), the
Angular adapter, is a complete example.

## What an adapter is

An adapter is wiring, never a second engine. It reads the framework's
configuration, creates the core's objects, hands them out the framework's
way (dependency injection, context, hooks) and disposes them when the
framework tears down. Scenarios, BI events, logging, redaction and the
broadcast protocol stay in the core. If an adapter needs a behaviour the
core lacks, add it to the core, where every adapter and every plain
application gets it.

An adapter needs only the package's public entry points: no deep import, no
private file.

## Steps

1. **One engine per application, or per fragment.** Create it with
   `uwtCreateTelemetry` at startup, from the framework's configuration, and
   share it through the framework's context or dependency injection, never
   one per component. If the framework's dependency injection resolves each
   concern on its own, as Angular's does, construct `UwtScenarioTelemetry`,
   `UwtBITelemetry` and `UwtLogTelemetry` instead, from
   `uwtResolveTelemetryConfig(overrides)`, one destination and one log store.
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
7. **Names.** Re-export the four registries, so applications declare their
   names on your package's module path and reach the same registries:

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

## How the Angular adapter does it

| Step         | In `@absaoss-cps/ngx-ui-watchtower`                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine       | Three root services, one per concern, each building its core class from injected config: [services/](../projects/ngx-ui-watchtower/src/lib/services/). A missing provider still fails where Angular reports it.                                                                                                                |
| Platform     | `uwtBrowserDocument()` returns `null` outside a browser (`PLATFORM_ID`); `uwtRunOutsideZone()` wraps `NgZone.runOutsideAngular`: [uwt-telemetry-safe.util.ts](../projects/ngx-ui-watchtower/src/lib/utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util.ts)                                                                  |
| Failures     | `uwtDevModeReporter`: failures and dropped data in development mode only, configuration problems always, prefixed `[ngx-ui-watchtower]` (same file)                                                                                                                                                                            |
| Reactive     | `settled$` is a `Subject` fed by `onSettled` and completed on destroy: [uwt-scenario-telemetry.service.ts](../projects/ngx-ui-watchtower/src/lib/services/uwt-scenario-telemetry.service/uwt-scenario-telemetry.service.ts); `traceScenario` passes the reporter to the core's `/rxjs`                                         |
| Destinations | `@Injectable()` subclasses of the core's sinks, host and log provider, built from `inject()`. In `'broadcast'` mode one `UwtBroadcastConnectionRef` per injector gives the sink and log provider one channel: [uwt-broadcast.messages.ts](../projects/ngx-ui-watchtower/src/lib/sinks/uwt-broadcast/uwt-broadcast.messages.ts) |
| Teardown     | The scenario and logger services and every destination subclass call `dispose()` from `ngOnDestroy`; the BI service holds nothing to release                                                                                                                                                                                   |
| Names        | [public-api.ts](../projects/ngx-ui-watchtower/src/public-api.ts) re-exports the registries, so `declare module '@absaoss-cps/ngx-ui-watchtower'` keeps working                                                                                                                                                                 |
| Dependency   | `"@absaoss-cps/ui-watchtower": "^<version>"` in its `package.json`, moved by Release Please                                                                                                                                                                                                                                    |

## Testing an adapter

The core's own tests cover the engine and the protocol. An adapter's tests
cover its wiring:

- **One engine per scope.** Everything the framework hands out in one
  application shares one engine, destination and log store.
- **Teardown.** Destroying the application disposes everything the adapter
  created; destroying it twice does nothing more.
- **Off and on the server.** With telemetry off, or rendering on a server,
  nothing listens to the page, no channel opens and no RUM client starts.
- **Names.** A type test that declares names on the adapter's module path:
  declared names compile, others don't, and plain strings compile while
  nothing is declared. See
  [type-tests/](../projects/ngx-ui-watchtower/type-tests/).
- **Shells and fragments.** An adapter's fragment and shell must exchange
  the recorded messages:
  [uwt-broadcast.wire.spec.ts](../projects/ngx-ui-watchtower/src/lib/sinks/uwt-broadcast/uwt-broadcast.wire.spec.ts)
  holds every pairing to `uwt-broadcast.wire.fixture.json`.

## Adding an adapter to this repository

An adapter can live anywhere and depend on the published core. To release it
from this repository, with a version of its own; each core release then also
releases it, with its dependency on the core moved:

1. **The package.** `projects/<adapter>/` with its `package.json` (its own
   version, and `^` the core's current version as a dependency), README and
   LICENSE, built into `dist/<adapter>` by `npm run build`, after the core.
2. **Release Please.** Add the package to `release-please-config.json`, with
   a `component` and an `initial-version` (e.g. `0.1.0`), its first release.
   Release Please adds it to `.release-please-manifest.json` when it
   releases.
3. **Publishing.** Add it to `PACKAGES` in
   [scripts/publish-packages.mjs](../scripts/publish-packages.mjs), after the
   core, with `dependsOn: '@absaoss-cps/ui-watchtower'`. Add its
   `--release_created` output to `.github/workflows/release-please.yml`, and
   to the publish job's condition.
4. **Checks.** Add it to `PACKAGES` in
   [scripts/api-snapshot.mjs](../scripts/api-snapshot.mjs) and run
   `npm run api:update`; add a consumer to
   [scripts/smoke/smoke.mjs](../scripts/smoke/smoke.mjs). The release
   scenarios in [scripts/release-check.mjs](../scripts/release-check.mjs) and
   the workflow test in
   [scripts/publish-packages.test.mjs](../scripts/publish-packages.test.mjs)
   name the core and the Angular package; extend them to the new one.
5. **Docs.** Add a row to the root README's package table.

Start with `PACKAGES`: `npm run test:release` then fails, in CI too, until
the config (or the manifest), the package's `package.json` and the release
job's outputs all match it.
