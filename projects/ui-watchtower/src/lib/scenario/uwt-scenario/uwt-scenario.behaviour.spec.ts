/**
 * @jest-environment jsdom
 */
import { UWT_DEFAULT_TELEMETRY_CONFIG } from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UwtScenarioTelemetryConfig } from '../../config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';
import { UwtScenarioRecord } from '../../models/uwt-scenario.models/uwt-scenario.models';
import { UWT_TELEMETRY_EVENT_TYPE } from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { UWT_DEFAULT_REDACT_CONFIG } from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import { UwtScenario, UwtScenarioDeps } from './uwt-scenario';

/** Captures what scenarios emitted. */
class RecordingSink extends UwtTelemetrySink {
  readonly events: { eventType: string; payload: Record<string, unknown> }[] =
    [];

  record(eventType: string, payload: object): void {
    this.events.push({
      eventType,
      payload: payload as Record<string, unknown>
    });
  }

  recordError(): void {}

  getSessionId(): string | undefined {
    return 'session-1';
  }

  setUserId(): void {}

  getUserId(): string | undefined {
    return 'user-1';
  }

  flush(): void {}
}

const MAX_TIMEOUT_MS = 2_147_483_647;

describe('UwtScenario, in detail', () => {
  let sink: RecordingSink;
  let settled: UwtScenarioRecord[];

  function scenario(
    name: string,
    config: Partial<UwtScenarioTelemetryConfig> = {},
    overrides: Partial<UwtScenarioDeps> & { timeoutMs?: number } = {}
  ): UwtScenario {
    const { timeoutMs, ...deps } = overrides;
    return new UwtScenario(
      { name, timeoutMs },
      {
        identity: { application: 'shop', environment: 'test', version: '1' },
        scenarioTelemetryConfig: {
          ...UWT_DEFAULT_TELEMETRY_CONFIG.scenario,
          ...config
        },
        redact: UWT_DEFAULT_REDACT_CONFIG,
        sink,
        onSettled: (_id, record) => settled.push(record),
        ...deps
      }
    );
  }

  beforeEach(() => {
    sink = new RecordingSink();
    settled = [];
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('delta', () => {
    it('should grow while running, then hold the duration', () => {
      const running = scenario('load');
      expect(running.delta).toBeGreaterThanOrEqual(0);

      running.complete();

      expect(Math.round(running.delta)).toBe(settled[0].delta);
    });

    it('should be 0, with an empty record, for an inert scenario', () => {
      const inert = scenario('load', {}, { inert: true });

      inert.step('fetch');
      inert.complete();

      expect(inert.delta).toBe(0);
      expect(settled).toEqual([]);
      expect(inert.toRecord()).toMatchObject({
        scenarioName: 'load',
        delta: 0,
        stepCount: 0,
        steps: []
      });
    });
  });

  describe('aggregates', () => {
    it('should count calls, ignore an end without a start, and count a call still open at the end', () => {
      const load = scenario('load');

      load.aggregateEnd('render');
      load.aggregateStart('fetch');
      load.aggregateStart('fetch');
      load.aggregateEnd('fetch');
      load.aggregateStart('fetch');
      load.complete();

      expect(settled[0].aggregates).toEqual([
        { name: 'fetch', elapsed: expect.any(Number), callCount: 2 }
      ]);
    });
  });

  describe('the record', () => {
    it('should carry the outcome: status code, message and reason', () => {
      scenario('search').incomplete({
        statusCode: 404,
        message: 'no results',
        reason: 'empty'
      });

      expect(settled[0]).toMatchObject({
        status: 'incomplete',
        statusCode: 404,
        message: 'no results',
        reason: 'empty'
      });
    });

    it('should flag a scenario with more steps than allowed', () => {
      const busy = scenario('busy', { maxSteps: 2 });

      busy.step('a').step('b').step('c');
      busy.complete();

      expect(settled[0].exceededStepsLimit).toBe(true);
    });

    it("should keep a step's message and reason, when it ends or fails", () => {
      const load = scenario('load');

      load.step('fetch').endStep({ message: 'cached', reason: 'warm' });
      load.step('parse').failStep(new Error('bad json'), { reason: 'format' });
      load.complete();

      const steps = settled[0].steps;
      expect(steps.find((s) => s.name === 'fetch')).toMatchObject({
        message: 'cached',
        reason: 'warm'
      });
      expect(steps.find((s) => s.name === 'parse')).toMatchObject({
        status: 'failure',
        reason: 'format'
      });
    });
  });

  describe('step events', () => {
    it('should send each step as it ends, with the session and user, when enabled', () => {
      const load = scenario('load', { emitLifecycleEvents: true });

      load.step('fetch');
      load.step('render');
      load.complete();

      const steps = sink.events.filter(
        (e) => e.eventType === UWT_TELEMETRY_EVENT_TYPE.scenarioStep
      );
      expect(steps.map((e) => e.payload.name)).toContain('fetch');
      expect(steps[0].payload).toMatchObject({
        scenarioName: 'load',
        application: 'shop',
        sessionId: 'session-1',
        userId: 'user-1'
      });
    });
  });

  describe('user timings', () => {
    let timings: {
      mark: jest.Mock;
      measure: jest.Mock;
      clearMarks: jest.Mock;
      clearMeasures: jest.Mock;
    };

    beforeEach(() => {
      timings = {
        mark: jest.fn(),
        measure: jest.fn(),
        clearMarks: jest.fn(),
        clearMeasures: jest.fn()
      };
      // jsdom has no User Timing API: stand-ins, removed after each test.
      for (const [name, fn] of Object.entries(timings)) {
        Object.defineProperty(performance, name, {
          value: fn,
          configurable: true,
          writable: true
        });
      }
    });

    afterEach(() => {
      for (const name of Object.keys(timings)) {
        delete (performance as unknown as Record<string, unknown>)[name];
      }
    });

    it('should mark and measure each step and the whole scenario, then clear its marks', () => {
      const load = new UwtScenario(
        { name: 'load', feature: 'customers' },
        {
          identity: { application: 'shop', environment: 'test', version: '1' },
          scenarioTelemetryConfig: {
            ...UWT_DEFAULT_TELEMETRY_CONFIG.scenario,
            userTimings: true
          },
          redact: UWT_DEFAULT_REDACT_CONFIG,
          sink,
          onSettled: () => undefined
        }
      );

      load.step('fetch');
      load.step('render');
      load.complete();

      const measured = timings.measure.mock.calls.map(([name]) => name);
      expect(measured).toEqual(
        expect.arrayContaining(['load [fetch]', 'load (customers)'])
      );
      expect(timings.mark).toHaveBeenCalled();
      expect(timings.clearMarks).toHaveBeenCalled();
    });

    it('should clear the marks of a scenario that never settles, after the fallback delay', () => {
      jest.useFakeTimers({ doNotFake: ['performance'] });
      const endless = scenario(
        'endless',
        { userTimings: true, markCleanupFallbackMs: 1000 },
        { timeoutMs: 0 }
      );

      endless.step('waiting');
      expect(timings.clearMarks).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1000);

      expect(timings.clearMarks).toHaveBeenCalled();
      expect(endless.isSettled).toBe(false);
    });
  });

  describe('timeouts', () => {
    it('should time out after longer than one timer can wait', () => {
      jest.useFakeTimers();
      const long = scenario('long', {}, { timeoutMs: MAX_TIMEOUT_MS + 1000 });

      jest.advanceTimersByTime(MAX_TIMEOUT_MS);
      expect(long.isSettled).toBe(false);
      jest.advanceTimersByTime(1000);

      expect(long.status).toBe('timeout');
    });
  });

  describe('debug output', () => {
    it('should write each settled scenario to the console under debugScenario', () => {
      localStorage.setItem('debugScenario', 'true');
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});

      scenario('checkout').complete();

      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[shop\]\[scenario\] checkout success in \d+ms -> /
        ),
        expect.objectContaining({ scenarioName: 'checkout' })
      );
    });
  });
});
