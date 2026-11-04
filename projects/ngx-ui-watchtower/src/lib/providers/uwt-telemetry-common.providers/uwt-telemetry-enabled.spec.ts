import { firstValueFrom, of, throwError } from 'rxjs';
import {
  ApplicationInitStatus,
  inject,
  Injectable,
  InjectionToken,
  PLATFORM_ID
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UwtTelemetryError } from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { UwtScenario } from '../../scenario/uwt-scenario/uwt-scenario';
import { traceScenario } from '../../scenario/uwt-scenario-operators/uwt-scenario-operators';
import { UwtScenarioTelemetryService } from '../../services/uwt-scenario-telemetry.service/uwt-scenario-telemetry.service';
import { UwtBITelemetryService } from '../../services/uwt-bi-telemetry.service/uwt-bi-telemetry.service';
import { UwtLoggerService } from '../../services/uwt-logger.service/uwt-logger.service';
import { UwtBroadcastTelemetrySink } from '../../sinks/uwt-broadcast/uwt-broadcast-telemetry.sink';
import { UwtTelemetryBroadcastHost } from '../../sinks/uwt-broadcast/uwt-broadcast-host.service';
import { UWT_LOG_API_PROVIDER } from '../uwt-log-api.provider/uwt-log-api.provider';
import {
  UwtTelemetryFeature,
  provideUwtTelemetry,
  provideUwtTelemetryBroadcastHost,
  provideUwtTelemetryDestination,
  provideUwtTelemetrySink,
  withLogging,
  withTelemetryEnabled
} from './uwt-telemetry-common.providers';

/** Counts every call the services make into a destination. */
@Injectable()
class RecordingSink extends UwtTelemetrySink {
  readonly events: string[] = [];
  readonly errors: UwtTelemetryError[] = [];
  started = 0;

  start(): void {
    this.started++;
  }

  record(eventType: string): void {
    this.events.push(eventType);
  }

  recordError(error: UwtTelemetryError): void {
    this.errors.push(error);
  }

  getSessionId(): string | undefined {
    return undefined;
  }

  setUserId(): void {}

  getUserId(): string | undefined {
    return undefined;
  }

  flush(): void {}
}

const logApi = {
  send: jest.fn(),
  query: jest.fn(() => Promise.resolve([]))
};

function configure(...features: UwtTelemetryFeature[]): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      provideUwtTelemetry(
        { application: 'my-app', environment: 'dev', version: '1.0.0' },
        withLogging({ mirrorErrorsToRum: true }),
        ...features
      ),
      provideUwtTelemetryDestination(RecordingSink, {
        init: (sink) => sink.start()
      }),
      { provide: UWT_LOG_API_PROVIDER, useValue: logApi }
    ]
  });
  TestBed.inject(ApplicationInitStatus);
}

/** Uses every concern once, the way application code does. */
function useEverything(): UwtScenario {
  const scenario = TestBed.inject(UwtScenarioTelemetryService).start({
    name: 'checkout'
  });
  scenario.step('pay').setData({ total: 10 }).endStep();
  scenario.complete();
  TestBed.inject(UwtBITelemetryService).track('export_clicked');
  TestBed.inject(UwtLoggerService)
    .getLogger('checkout')
    .error('Payment failed');
  TestBed.resetTestingModule(); // destroys the services, flushing logs
  return scenario;
}

describe('withTelemetryEnabled', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    logApi.send.mockClear();
    logApi.query.mockClear();
  });

  describe('when false', () => {
    beforeEach(() => configure(withTelemetryEnabled(false)));

    it('should send nothing anywhere and skip the destination init', () => {
      const sink = TestBed.inject(RecordingSink);

      useEverything();

      expect(sink.started).toBe(0);
      expect(sink.events).toEqual([]);
      expect(sink.errors).toEqual([]);
      expect(logApi.send).not.toHaveBeenCalled();
    });

    it('should hand out inert scenarios that keep their own id and name', () => {
      jest.useFakeTimers();
      const service = TestBed.inject(UwtScenarioTelemetryService);
      const settled = jest.fn();
      service.settled$.subscribe(settled);

      const first = service.start({ name: 'checkout' });
      const second = service.start({
        name: 'checkout',
        parentScenarioId: first.id
      });

      expect(first).toBeInstanceOf(UwtScenario);
      expect(first.id).not.toBe(second.id);
      expect(first.name).toBe('checkout');
      expect(second.toRecord()).toMatchObject({
        scenarioId: second.id,
        parentScenarioId: first.id,
        scenarioName: 'checkout',
        stepCount: 0,
        steps: []
      });
      expect(first.step('pay').setData({ a: 1 }).endStep()).toBe(first);
      first.fail({ error: new Error('boom') });
      expect(first.status).toBeUndefined();
      expect(first.isSettled).toBe(false);
      expect(first.delta).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
      expect(service.find(first.id)).toBeUndefined();
      expect(service.findByName('checkout')).toEqual([]);
      expect(service.getActive()).toEqual([]);
      expect(settled).not.toHaveBeenCalled();
    });

    it('should let traceScenario pass values and errors through', async () => {
      const scenario = TestBed.inject(UwtScenarioTelemetryService).start({
        name: 'load'
      });
      const error = new Error('boom');

      await expect(
        firstValueFrom(of(42).pipe(traceScenario(scenario)))
      ).resolves.toBe(42);
      await expect(
        firstValueFrom(throwError(() => error).pipe(traceScenario(scenario)))
      ).rejects.toBe(error);
    });

    it('should resolve log queries empty without calling the provider', async () => {
      await expect(TestBed.inject(UwtLoggerService).query({})).resolves.toEqual(
        []
      );
      expect(logApi.query).not.toHaveBeenCalled();
    });

    it('should add no page listeners', () => {
      const onWindow = jest.spyOn(window, 'addEventListener');
      const onDocument = jest.spyOn(document, 'addEventListener');

      TestBed.inject(UwtScenarioTelemetryService);
      TestBed.inject(UwtLoggerService);

      expect(onWindow).not.toHaveBeenCalled();
      expect(onDocument).not.toHaveBeenCalled();
    });
  });

  it('should behave as before when true', () => {
    configure(withTelemetryEnabled(true));
    const sink = TestBed.inject(RecordingSink);

    const scenario = useEverything();

    expect(sink.started).toBe(1);
    expect(sink.events).toHaveLength(2); // the scenario and the BI event
    expect(sink.errors).toHaveLength(1);
    expect(logApi.send).toHaveBeenCalled();
    expect(scenario.status).toBe('success');
  });

  it('should accept a factory run in an injection context', () => {
    const TELEMETRY_ON = new InjectionToken<boolean>('TELEMETRY_ON');
    TestBed.configureTestingModule({
      providers: [{ provide: TELEMETRY_ON, useValue: false }]
    });
    configure(withTelemetryEnabled(() => inject(TELEMETRY_ON)));
    const sink = TestBed.inject(RecordingSink);

    useEverything();

    expect(sink.events).toEqual([]);
  });

  it('should still fail at bootstrap on two destinations', () => {
    TestBed.configureTestingModule({
      providers: [
        provideUwtTelemetry(
          { application: 'my-app', environment: 'dev', version: '1.0.0' },
          withTelemetryEnabled(false)
        ),
        provideUwtTelemetrySink('noop'),
        provideUwtTelemetryDestination(RecordingSink)
      ]
    });

    expect(() => TestBed.inject(ApplicationInitStatus)).toThrow(
      'More than one telemetry destination is provided'
    );
  });

  describe('broadcast, when false', () => {
    const channel = jest.fn();
    const lockRequest = jest.fn(() => new Promise<void>(() => undefined));

    beforeEach(() => {
      Object.defineProperty(globalThis, 'BroadcastChannel', {
        value: channel,
        configurable: true
      });
      Object.defineProperty(globalThis.navigator, 'locks', {
        value: { request: lockRequest },
        configurable: true
      });
    });

    afterEach(() => {
      channel.mockClear();
      lockRequest.mockClear();
      delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
      delete (globalThis.navigator as { locks?: unknown }).locks;
    });

    function configureBroadcast(sink: 'broadcast' | 'noop'): void {
      TestBed.configureTestingModule({
        providers: [
          { provide: PLATFORM_ID, useValue: 'browser' },
          provideUwtTelemetry(
            { application: 'my-app', environment: 'dev', version: '1.0.0' },
            withTelemetryEnabled(false)
          ),
          provideUwtTelemetrySink(sink),
          ...(sink === 'noop'
            ? [
                provideUwtTelemetryBroadcastHost(),
                { provide: UWT_LOG_API_PROVIDER, useValue: logApi }
              ]
            : [])
        ]
      });
      TestBed.inject(ApplicationInitStatus);
    }

    it('should open no channel in a fragment', () => {
      configureBroadcast('broadcast');
      TestBed.inject(UwtBroadcastTelemetrySink).record('scenario', {});

      expect(channel).not.toHaveBeenCalled();
    });

    it('should neither listen nor take the leader lock in the shell', () => {
      configureBroadcast('noop');
      TestBed.inject(UwtTelemetryBroadcastHost);

      expect(channel).not.toHaveBeenCalled();
      expect(lockRequest).not.toHaveBeenCalled();
    });
  });
});
