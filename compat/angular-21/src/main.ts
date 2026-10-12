import { Component, inject, Injectable } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  UWT_LOG_API_PROVIDER,
  UwtBITelemetryService,
  UwtLoggerService,
  UwtNoopLogApiProvider,
  UwtScenarioTelemetryService,
  provideUwtTelemetry,
  traceScenario,
  withLogging,
  withTelemetryEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  UWT_RUM_CREDENTIALS_PROVIDER,
  UwtRumBootstrap,
  UwtRumCredentialsProvider,
  provideUwtTelemetryRumSink
} from '@absaoss-cps/ngx-ui-watchtower/rum';

declare module '@absaoss-cps/ngx-ui-watchtower' {
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
    customers: true;
  }
}

@Injectable({ providedIn: 'root' })
class RumCredentials implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    return null;
  }
}

/** Uses each public service, so the build links and type-checks them. */
@Component({ selector: 'app-root', template: '' })
class App {
  constructor() {
    const scenario = inject(UwtScenarioTelemetryService).start({
      name: 'load-customers'
    });
    scenario.step('fetch');
    of([]).pipe(traceScenario(scenario)).subscribe();
    inject(UwtBITelemetryService).track('export_clicked');
    inject(UwtLoggerService).getLogger('customers').log('loaded');
  }
}

bootstrapApplication(App, {
  providers: [
    provideUwtTelemetry(
      { application: 'consumer', environment: 'ci', version: '0.0.0' },
      withLogging(),
      withTelemetryEnabled(true)
    ),
    provideUwtTelemetryRumSink(),
    { provide: UWT_RUM_CREDENTIALS_PROVIDER, useExisting: RumCredentials },
    { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider }
  ]
}).catch((error) => console.error(error));
