/**
 * Every public export of `@absaoss-cps/ngx-ui-watchtower` and its `/rum`
 * entry point, used the way an application or an integration uses it.
 *
 * Compiled by `npm run typecheck`, never run. It must keep compiling
 * unchanged: that is what "no consumer change" means for the types. No
 * registry is augmented here, so every name is a plain string; see
 * `augmented.ts` for registered names.
 */
import { ApplicationConfig, inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  provideUwtTelemetryDestination,
  provideUwtTelemetrySink,
  traceScenario,
  UWT_BI_TELEMETRY_CONFIG,
  UWT_BROADCAST_CHANNEL,
  UWT_DEFAULT_BROADCAST_CHANNEL,
  UWT_DEFAULT_EVENT_NAMESPACE,
  UWT_DEFAULT_REDACT_CONFIG,
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_LOG_API_PROVIDER,
  UWT_LOG_CONFIG,
  UWT_LOG_LEVEL_ORDER,
  UWT_REDACT_CONFIG,
  UWT_REDACTED,
  UWT_SCENARIO_TELEMETRY_CONFIG,
  UWT_TELEMETRY_ENABLED,
  UWT_TELEMETRY_EVENT_TYPE,
  UWT_TELEMETRY_IDENTITY,
  UwtBIEvent,
  UwtBIEventDetail,
  UwtBIEventName,
  UwtBIEventNames,
  UwtBITelemetryConfig,
  UwtBITelemetryService,
  UwtBroadcastLogApiProvider,
  UwtBroadcastTelemetrySink,
  uwtClassifyTelemetryEvent,
  UwtDebugFlag,
  uwtEventTypes,
  uwtIsDebugEnabled,
  UwtLogApiProvider,
  UwtLogConfig,
  UwtLogDetail,
  UwtLogger,
  UwtLoggerName,
  UwtLoggerNames,
  UwtLoggerService,
  UwtLogLevel,
  UwtLogQuery,
  UwtLogRecord,
  uwtMarkSessionStart,
  uwtNormalizeError,
  UwtNoopLogApiProvider,
  UwtNoopTelemetrySink,
  UwtPiiValuePattern,
  UwtRedactConfig,
  uwtRedactConfigFor,
  uwtRedactMetadata,
  UwtScenario,
  UwtScenarioAggregate,
  UwtScenarioName,
  UwtScenarioNames,
  UwtScenarioOptions,
  UwtScenarioOutcome,
  UwtScenarioRecord,
  UwtScenarioStatus,
  UwtScenarioStep,
  UwtScenarioStepDetail,
  UwtScenarioStepEvent,
  UwtScenarioStepStatus,
  UwtScenarioSteps,
  UwtScenarioTelemetryConfig,
  UwtScenarioTelemetryService,
  uwtScrubString,
  UwtStepName,
  UwtTelemetryAttribution,
  UwtTelemetryBroadcastHost,
  UwtTelemetryDestinationOptions,
  UwtTelemetryError,
  UwtTelemetryEventTypes,
  UwtTelemetryFeature,
  UwtTelemetryIdentity,
  UwtTelemetryLocalSinkMode,
  UwtTelemetryMetadata,
  UwtTelemetrySink,
  UwtTelemetrySinkEvent,
  UwtTraceScenarioOptions,
  uwtUuid,
  withBIEvents,
  withLogging,
  withRedaction,
  withScenarios,
  withTelemetryEnabled
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  provideUwtTelemetryRumSink,
  UWT_RUM_CREDENTIALS_PROVIDER,
  UwtRumAppMonitorConfig,
  UwtRumBootstrap,
  UwtRumCredentials,
  UwtRumCredentialsProvider,
  UwtRumTelemetrySink
} from '@absaoss-cps/ngx-ui-watchtower/rum';

/** A destination an application writes itself. */
@Injectable()
export class AppSink extends UwtTelemetrySink {
  record(_type: string, _payload: object, _meta?: UwtTelemetryMetadata): void {
    // Sent elsewhere.
  }

  recordError(_error: UwtTelemetryError, _meta?: UwtTelemetryMetadata): void {
    // Sent elsewhere.
  }

  getSessionId(): string | undefined {
    return undefined;
  }

  setUserId(_userId: string | undefined): void {
    // Kept elsewhere.
  }

  getUserId(): string | undefined {
    return undefined;
  }

  flush(_beacon?: boolean): void {
    // Nothing buffered.
  }
}

/** A log backend. */
@Injectable()
export class AppLogBackend implements UwtLogApiProvider {
  readonly ranks: number[] = [];

  send(record: UwtLogRecord): void {
    const level: UwtLogLevel = record.level;
    this.ranks.push(UWT_LOG_LEVEL_ORDER[level]);
  }

  query(_filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    return Promise.resolve([]);
  }

  flush(): void {
    // Nothing buffered.
  }
}

/** RUM credentials from the application's broker. */
@Injectable()
export class AppRumCredentials implements UwtRumCredentialsProvider {
  async load(): Promise<UwtRumBootstrap | null> {
    const config: UwtRumAppMonitorConfig = {
      applicationId: 'app-monitor',
      region: 'eu-west-1',
      applicationVersion: '1.0.0'
    };
    const credentials: UwtRumCredentials = {
      accessKeyId: 'a',
      secretAccessKey: 's',
      sessionToken: 't',
      expiration: '2026-01-01T00:00:00Z'
    };
    return { config, credentials };
  }
}

const identity: UwtTelemetryIdentity = {
  application: 'app',
  environment: 'prod',
  version: '1.0.0'
};
const logConfig: Partial<UwtLogConfig> = { minLevel: 'warn' };
const scenarioConfig: Partial<UwtScenarioTelemetryConfig> = { maxSteps: 10 };
const biConfig: Partial<UwtBITelemetryConfig> = {};
const redactConfig: Partial<UwtRedactConfig> = {};
const features: UwtTelemetryFeature[] = [
  withLogging(logConfig),
  withScenarios(scenarioConfig),
  withBIEvents(biConfig),
  withRedaction(redactConfig),
  withTelemetryEnabled(() => true)
];
const destination: UwtTelemetryDestinationOptions<AppSink> = {
  init: (sink) => sink.flush()
};
const mode: UwtTelemetryLocalSinkMode = 'broadcast';

/** Each way an application wires the library. */
export const configs: ApplicationConfig[] = [
  {
    providers: [
      provideUwtTelemetry(identity, ...features),
      provideUwtTelemetryDestination(AppSink, destination),
      { provide: UWT_LOG_API_PROVIDER, useClass: AppLogBackend }
    ]
  },
  {
    providers: [
      provideUwtTelemetry(identity),
      provideUwtTelemetrySink(mode, { channelName: 'app' }),
      provideUwtTelemetrySink('noop')
    ]
  },
  {
    providers: [
      provideUwtTelemetry(identity),
      provideUwtTelemetryRumSink(),
      { provide: UWT_RUM_CREDENTIALS_PROVIDER, useClass: AppRumCredentials },
      { provide: UWT_LOG_API_PROVIDER, useClass: UwtNoopLogApiProvider },
      provideUwtTelemetryBroadcastHost('app')
    ]
  },
  {
    providers: [
      { provide: UWT_TELEMETRY_IDENTITY, useValue: identity },
      {
        provide: UWT_LOG_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.logs
      },
      {
        provide: UWT_SCENARIO_TELEMETRY_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.scenario
      },
      {
        provide: UWT_BI_TELEMETRY_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.bi
      },
      { provide: UWT_REDACT_CONFIG, useValue: UWT_DEFAULT_REDACT_CONFIG },
      { provide: UWT_TELEMETRY_ENABLED, useValue: true },
      {
        provide: UWT_BROADCAST_CHANNEL,
        useValue: UWT_DEFAULT_BROADCAST_CHANNEL
      }
    ]
  }
];

/** The facades, as application code injects and calls them. */
export class Checkout {
  private readonly scenarios = inject(UwtScenarioTelemetryService);
  private readonly bi = inject(UwtBITelemetryService);
  private readonly logger: UwtLogger = inject(UwtLoggerService).getLogger('x');
  private readonly logs = inject(UwtLoggerService);
  readonly classes = [
    UwtBroadcastTelemetrySink,
    UwtNoopTelemetrySink,
    UwtRumTelemetrySink,
    UwtTelemetryBroadcastHost,
    UwtBroadcastLogApiProvider
  ];

  pay(): unknown[] {
    const options: UwtScenarioOptions = { name: 'checkout', timeoutMs: 5000 };
    const scenario: UwtScenario = this.scenarios.start(options);
    scenario.step('pay', { cart: 'c-1' }).endStep({ metadata: { ok: true } });
    scenario.aggregateStart('validate').aggregateEnd('validate');
    scenario.setData({ items: 2 });
    const detail: UwtScenarioStepDetail = {};
    scenario.failStep(new Error('retry'), detail);
    const outcome: UwtScenarioOutcome = { statusCode: 200 };
    const traced: UwtTraceScenarioOptions<number> = {
      outcome: (value) => ({ metadata: { value } }),
      cancelOutcome: outcome
    };
    const settled: Observable<UwtScenarioRecord> = this.scenarios.settled$;
    const found: UwtScenario[] = [
      ...this.scenarios.findByName('checkout'),
      ...this.scenarios.getActive()
    ];
    return [
      settled,
      found,
      this.scenarios.find('id'),
      this.scenarios.findByNameAndId('checkout', 'id'),
      of(1).pipe(traceScenario(scenario, traced))
    ];
  }

  track(): Promise<UwtLogRecord[]> {
    const name: UwtBIEventName = 'export_clicked';
    const biDetail: UwtBIEventDetail = {};
    this.bi.track(name, { format: 'csv' }, biDetail);
    const logDetail: UwtLogDetail = { error: new Error('x') };
    this.logger.warn('careful', logDetail);
    return this.logs.query({ logger: 'x', limit: 1 });
  }
}

/** The utilities an application or a sink calls. */
export function utilities(): unknown[] {
  const types: UwtTelemetryEventTypes = uwtEventTypes(
    UWT_DEFAULT_EVENT_NAMESPACE
  );
  const event: UwtTelemetrySinkEvent = uwtClassifyTelemetryEvent(
    UWT_TELEMETRY_EVENT_TYPE.bi,
    {}
  );
  const flag: UwtDebugFlag = 'debugScenario';
  const redact: UwtRedactConfig = uwtRedactConfigFor(
    UWT_DEFAULT_REDACT_CONFIG,
    true
  );
  const patterns: UwtPiiValuePattern[] = redact.scanValuePatterns;
  uwtMarkSessionStart(uwtUuid());
  return [
    types,
    event,
    uwtIsDebugEnabled(flag),
    uwtScrubString('a@b.c', redact),
    uwtRedactMetadata({ email: 'a@b.c' }, redact),
    uwtNormalizeError(new Error('x'), redact),
    patterns,
    UWT_REDACTED
  ];
}

/** Every remaining type, as an integration names it. */
export interface Everything {
  attribution: UwtTelemetryAttribution;
  biEvent: UwtBIEvent;
  biNames: UwtBIEventNames;
  logger: UwtLoggerName;
  loggerNames: UwtLoggerNames;
  aggregate: UwtScenarioAggregate;
  scenario: UwtScenarioName;
  scenarioNames: UwtScenarioNames;
  status: UwtScenarioStatus;
  step: UwtScenarioStep;
  stepEvent: UwtScenarioStepEvent;
  stepStatus: UwtScenarioStepStatus;
  steps: UwtScenarioSteps;
  stepName: UwtStepName;
  error: UwtTelemetryError;
}
