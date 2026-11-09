<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/AbsaOSS/ui-watchtower/main/assets/logo/logo-stacked-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/AbsaOSS/ui-watchtower/main/assets/logo/logo-stacked-light.svg">
    <img src="https://raw.githubusercontent.com/AbsaOSS/ui-watchtower/main/assets/logo/logo-stacked-auto.svg" alt="Angular UI Watchtower" width="280">
  </picture>
</p>

# ngx-ui-watchtower

Telemetry for Angular apps, in three parts:

- **Scenarios** — did a user journey succeed, and how long did it take?
- **BI events** — which features are used?
- **Logs** — what exactly happened?

Events go to AWS CloudWatch RUM. Logs go to a backend you provide.

The library's names are prefixed `Uwt`, short for UI Watchtower —
`UwtLoggerService`, `provideUwtTelemetry`, `UWT_LOG_API_PROVIDER`.

## Install

```bash
npm install @absaoss-cps/ngx-ui-watchtower
npm install aws-rum-web   # only for the AWS RUM sink
```

Requires Angular 21 or 22 and RxJS 7.8.

**Upgrading with an older cps-ui-kit:** the Event Inspector needs cps-ui-kit
21.32 or later (or 22). npm checks that range whenever cps-ui-kit is
installed, so an app on an older version can't install this release until it
upgrades cps-ui-kit, even if it never uses the Inspector.

## Setup

```ts
import {
  UWT_LOG_API_PROVIDER,
  provideUwtTelemetry
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_RUM_CREDENTIALS_PROVIDER,
  provideUwtTelemetryRumSink
} from '@absaoss-cps/ngx-ui-watchtower/rum';

providers: [
  provideUwtTelemetry({
    application: 'my-app',
    environment: 'production',
    version: '1.0.0'
  }),

  // Where events go
  provideUwtTelemetryRumSink(),
  { provide: UWT_RUM_CREDENTIALS_PROVIDER, useExisting: MyRumCredentials },

  // Where logs go
  { provide: UWT_LOG_API_PROVIDER, useExisting: MyLogBackend }
];
```

There are no default destinations — you always choose them, so an app can't
look wired up while shipping nothing. For local development, ship nowhere:

```ts
providers: [
  provideUwtTelemetry({ application: 'my-app', environment: 'dev', version }),
  provideUwtTelemetrySink('noop'),
  { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider }
];
```

Optional settings are added with `withScenarios()`, `withLogging()`,
`withBIEvents()` and `withRedaction()`:

```ts
provideUwtTelemetry(
  { application: 'my-app', environment: 'production', version: '1.0.0' },
  withLogging({ minLevel: 'warn' }),
  withScenarios({ defaultTimeoutMs: 60_000 })
);
```

### AWS credentials

The RUM sink gets its AWS details from a credentials provider: a class you
write that fetches them from your backend, registered as
`UWT_RUM_CREDENTIALS_PROVIDER`. The sink calls its `load()` at startup and
again shortly before the credentials expire.

```ts
@Injectable({ providedIn: 'root' })
export class MyRumCredentials implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    const res = await fetch('/rum/init', { cache: 'no-store' });
    if (!res.ok) throw new Error(`RUM bootstrap failed: ${res.status}`); // retried

    const { enabled, config, credentials } = await res.json();
    return enabled ? { config, credentials } : null; // null = don't ship
  }
}
```

Settings that need a `RegExp` or a function — `pagesToExclude`, or
`urlsToExclude` and `ignore` inside `telemetries` — can't come from JSON. If
one arrives as a string, the sink doesn't start RUM for the page and warns in
the console, rather than let the SDK throw or record what you meant to
exclude. Set those in code.

### Log backend

```ts
@Injectable({ providedIn: 'root' })
export class MyLogBackend implements UwtLogApiProvider {
  send(record: UwtLogRecord): void {
    void fetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify(record),
      // Only while the page is hidden (it may be closing): browsers reject
      // keepalive requests once all in flight exceed 64 KiB, so a burst would
      // be lost.
      keepalive: document.visibilityState === 'hidden'
    }).catch(() => undefined);
  }

  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    const params = new URLSearchParams(filter as Record<string, string>);
    return fetch(`/api/logs?${params}`).then((r) => r.json());
  }
}
```

Batching, retries and authentication are up to your backend class. If it
batches, add a `flush()` method — the library calls it when the page is
hidden or closed. Send from it with `navigator.sendBeacon` or a `keepalive`
request every time, not only when the page says it is hidden: Safari still
says `visible` while a page that is reloading or navigating away hides, and
cancels a plain request then. For the same reason, the example above can lose
a record written as the page goes, in Safari.

### Using a different destination

RUM is one destination; a realm always has exactly one. To send somewhere
else, swap it — application code doesn't change:

```ts
providers: [
  provideUwtTelemetry({ application: 'my-app', environment, version }),

  // Where events go — replaces provideUwtTelemetryRumSink() and
  // UWT_RUM_CREDENTIALS_PROVIDER
  provideUwtTelemetryDestination(MyBackendSink),

  // Where logs go — unchanged
  { provide: UWT_LOG_API_PROVIDER, useExisting: MyLogBackend }
];
```

`MyBackendSink` extends `UwtTelemetrySink`; in its `record()`,
`uwtClassifyTelemetryEvent(eventType, payload)` tells a scenario from a BI
event. Providing two destinations fails at startup.

### Turning telemetry off

To run telemetry in some environments only, keep the same providers and add
one switch — a value, or a factory run at startup:

```ts
provideUwtTelemetry(identity, withTelemetryEnabled(environment.name === 'dev'));
provideUwtTelemetry(
  identity,
  withTelemetryEnabled(() => inject(APP_CONFIG).telemetry)
);
```

When off, nothing is sent and nothing runs: no credentials fetch, no RUM SDK
download, no broadcast channel, no page listeners. Your code doesn't change —
`start()` still returns a scenario (inert: it records nothing and never
settles), lookups find nothing, `settled$` never emits, loggers do nothing and
`query()` resolves `[]`. The switch is read once at startup. It doesn't
shrink the bundle, but the RUM SDK is loaded on demand, so it's never
downloaded while telemetry is off.

## Declare your names

Scenario, step, event and logger names are typed, so a typo is a compile
error instead of a broken dashboard. Declare them once:

```ts
// src/app/telemetry.schema.ts
declare module '@absaoss-cps/ngx-ui-watchtower' {
  interface UwtScenarioNames {
    'load-customers': true;
  }
  interface UwtScenarioSteps {
    fetch: true;
    render: true;
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

Until you declare any, plain strings are accepted.

## Scenarios

A scenario measures one user journey.

```ts
class CustomersComponent {
  private readonly scenarios = inject(UwtScenarioTelemetryService);

  async load() {
    const scenario = this.scenarios.start({ name: 'load-customers' });

    try {
      scenario.step('fetch');
      const rows = await this.api.fetchCustomers();

      scenario.step('render');
      this.rows.set(rows);

      scenario.complete();
    } catch (error) {
      scenario.fail({ error });
    }
  }
}
```

End every scenario with one of these:

| Method         | Use when                                            |
| -------------- | --------------------------------------------------- |
| `complete()`   | It worked                                           |
| `fail()`       | Something broke                                     |
| `incomplete()` | An expected dead end, e.g. a search with no results |
| `cancel()`     | It no longer matters, e.g. the user moved on        |

A scenario that is never ended times out after 30 seconds, and one still
running when the page closes is recorded as abandoned. Calling an end method
twice is harmless — the first one wins.

For RxJS, `traceScenario` ends the scenario for you:

```ts
this.api.fetchCustomers().pipe(traceScenario(scenario)).subscribe();
```

## BI events

```ts
class ExportButton {
  private readonly bi = inject(UwtBITelemetryService);

  onClick() {
    this.bi.track('export_clicked', { format: 'csv' });
  }
}
```

## Logging

```ts
class CheckoutService {
  private readonly logger = inject(UwtLoggerService).getLogger('checkout');

  async submit(scenario: UwtScenario) {
    this.logger.log('Submitting order');

    try {
      await this.api.pay();
    } catch (error) {
      // correlationId ties this line to the scenario's journey
      this.logger.error('Payment failed', {
        error,
        correlationId: scenario.id
      });
    }
  }
}
```

Read log lines back through your backend, for example everything written
during one journey:

```ts
class SupportService {
  private readonly logs = inject(UwtLoggerService);

  linesOf(scenario: UwtScenario) {
    return this.logs.query({ correlationId: scenario.id });
  }
}
```

## Signed-in user

```ts
const sink = inject(UwtTelemetrySink);

sink.setUserId(user.id); // on sign-in — an opaque UUID, never an email
sink.setUserId(undefined); // on sign-out
```

RUM accepts only a UUID as a user id — with MSAL, use the account's
`localAccountId`. Anonymous users get a random one, so every event also
carries `signedIn: true | false` to tell them apart. It's absent until your
first `setUserId` call, so make that call early, e.g. right after MSAL
initializes.

Signing out while nobody is signed in does nothing, so it's safe to call
`setUserId` on every change of your auth state.

## Privacy

Metadata accepts only flat values (strings, numbers, booleans, `null`), so objects
full of personal data can't slip in. On top of that, the library redacts
values under keys like `password` or `token`, strips URL query strings, and
caps sizes. To also catch emails, card numbers and similar by their shape:

```ts
withRedaction({ scanValuePatterns: ['email', 'creditCard'] });
```

Send opaque user ids, and keep personal data out of your URLs.

## Micro-frontends

In a page composed of fragments, the shell sends everything and the
fragments forward to it — so a user is one session, not one per fragment.

```ts
// shell
providers: [
  provideUwtTelemetry({ application: 'shell', environment, version }),
  provideUwtTelemetryRumSink(),
  { provide: UWT_LOG_API_PROVIDER, useExisting: MyLogBackend },
  provideUwtTelemetryBroadcastHost()
];

// each fragment
providers: [
  provideUwtTelemetry({ application: 'cart', environment, version }),
  provideUwtTelemetrySink('broadcast')
];
```

Fragment code doesn't change. Give each fragment its own `application` name.

## Seeing what is sent

**In the console** — run in DevTools, no reload needed:

```js
localStorage.setItem('debugScenario', 'true');
localStorage.setItem('debugBI', 'true');
localStorage.setItem('debugLogger', 'true'); // or 'checkout,cart' for some loggers
```

**In the app** — add the Event Inspector (needs `cps-ui-kit` 21.32+ or 22):

```ts
import { provideUwtEventInspector } from '@absaoss-cps/ngx-ui-watchtower/event-inspector';

providers: [provideUwtEventInspector()];
```

Open it with **Shift+E+I** (hold Shift, press E, then I), outside a text field.
It lists everything the app sends from that moment on in one timeline, newest
first, showing every kind or just BI, scenarios or logs, with search, filters
and JSON export. It opens as a dialog, with a Transparency slider; its Dock
buttons move it to its own window or a pane on the left, right or bottom (on a
screen at least 640px wide).

To also see what happened before you opened it, keep the latest events from
the app's start — at the cost of copying every event handed over, popup open
or not:

```ts
provideUwtEventInspector({ captureBeforeOpen: 100 }); // per kind
```

A pane pushes the page aside, but elements fixed to the window stay put. To
keep them beside the pane, use the size it publishes on `<html>`
(`--uwt-inspector-inset-left`, `-right` or `-bottom`):

```css
.app-header {
  left: var(--uwt-inspector-inset-left, 0px);
  right: var(--uwt-inspector-inset-right, 0px);
}
```

## Testing

```ts
TestBed.configureTestingModule({
  providers: [
    provideUwtTelemetry({
      application: 'test',
      environment: 'test',
      version: '0'
    }),
    provideUwtTelemetrySink('noop'),
    { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider }
  ]
});
```

## Good to know

- Telemetry never breaks your app: library errors are caught, and reported
  to the console only in dev mode.
- It is safe under server-side rendering.
- A scenario sends one event when it ends, not one per step — AWS RUM allows
  200 events per session by default.
- RUM's own telemetry defaults to errors, performance and same-origin HTTP;
  set `telemetries` in the RUM config to change it. Without `'errors'`, the
  sink still loads RUM's error plugin, capturing nothing by itself, because
  `mirrorErrorsToRum` needs it — unless the app loads one itself through
  `eventPluginsToLoad`.

## License

Apache License 2.0.
