/**
 * @jest-environment jsdom
 */
import { UwtLogRecord } from '../../models/uwt-log.models/uwt-log.models';
import { UwtScenarioRecord } from '../../models/uwt-scenario.models/uwt-scenario.models';
import {
  UwtTelemetryError,
  UwtTelemetryMetadata
} from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import {
  UwtLogApiProvider,
  UwtLogQuery
} from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import { UwtTelemetrySink } from '../../sinks/uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { UWT_REDACTED } from '../../utils/uwt-telemetry-redact.util/uwt-telemetry-redact.util';
import * as uwtTelemetrySafeUtil from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { UwtTelemetryOptions, uwtCreateTelemetry } from './uwt-telemetry';

/** Keeps what the engine sends, so a test can assert on it. */
class RecordingSink extends UwtTelemetrySink {
  readonly events: { eventType: string; payload: Record<string, unknown> }[] =
    [];

  readonly errors: UwtTelemetryError[] = [];
  readonly flushes: (boolean | undefined)[] = [];
  userId: string | undefined;

  record(eventType: string, payload: object): void {
    this.events.push({
      eventType,
      payload: payload as Record<string, unknown>
    });
  }

  recordError(error: UwtTelemetryError, _meta?: UwtTelemetryMetadata): void {
    this.errors.push(error);
  }

  getSessionId(): string | undefined {
    return 'session-1';
  }

  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  flush(beacon?: boolean): void {
    this.flushes.push(beacon);
  }

  ofType(eventType: string): Record<string, unknown>[] {
    return this.events
      .filter((e) => e.eventType === eventType)
      .map((e) => e.payload);
  }
}

/** A log store kept in memory. */
class RecordingLogApi implements UwtLogApiProvider {
  readonly records: UwtLogRecord[] = [];
  flushCount = 0;

  send(record: UwtLogRecord): void {
    this.records.push(record);
  }

  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    return Promise.resolve(
      this.records.filter((r) => !filter.logger || r.logger === filter.logger)
    );
  }

  flush(): void {
    this.flushCount++;
  }
}

const identity = {
  application: 'cart',
  environment: 'test',
  version: '1.0.0',
  eventNamespace: 'com.cart'
};

function create(overrides: Partial<UwtTelemetryOptions> = {}) {
  const sink = new RecordingSink();
  const logApi = new RecordingLogApi();
  const telemetry = uwtCreateTelemetry({
    identity,
    destination: sink,
    logApi,
    scenarios: { defaultTimeoutMs: 0 },
    ...overrides
  });
  return { telemetry, sink, logApi };
}

describe('uwtCreateTelemetry', () => {
  let engines: { dispose(): void }[];

  beforeEach(() => {
    engines = [];
  });

  afterEach(() => {
    engines.forEach((engine) => engine.dispose());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function engine(overrides: Partial<UwtTelemetryOptions> = {}) {
    const created = create(overrides);
    engines.push(created.telemetry);
    return created;
  }

  describe('scenarios', () => {
    it('should send a settled scenario to the destination, with its steps and identity', () => {
      const { telemetry, sink } = engine();

      telemetry.scenarios.start({ name: 'checkout' }).step('pay').complete();

      const [record] = sink.ofType('com.cart.scenario');
      expect(record).toMatchObject({
        scenarioName: 'checkout',
        status: 'success',
        application: 'cart',
        sessionId: 'session-1'
      });
      expect((record.steps as { name: string }[]).map((s) => s.name)).toEqual([
        'scenario-start',
        'pay',
        'scenario-end'
      ]);
    });

    it('should track what is in flight until it settles', () => {
      const { telemetry } = engine();

      const a = telemetry.scenarios.start({ name: 'checkout' });
      const b = telemetry.scenarios.start({ name: 'search' });
      expect(telemetry.scenarios.getActive()).toEqual([a, b]);
      expect(telemetry.scenarios.findByName('checkout')).toEqual([a]);
      expect(
        telemetry.scenarios.findByNameAndId('search', a.id)
      ).toBeUndefined();

      a.complete();
      expect(telemetry.scenarios.find(a.id)).toBeUndefined();
      expect(telemetry.scenarios.getActive()).toEqual([b]);
    });

    it('should give every settled listener one shared copy, so none can change what is sent', () => {
      const { telemetry, sink } = engine();
      const seen: UwtScenarioRecord[] = [];
      telemetry.scenarios.onSettled((record) => {
        seen.push(record);
        record.metadata = { tampered: true };
      });
      telemetry.scenarios.onSettled((record) => seen.push(record));

      telemetry.scenarios
        .start({ name: 'checkout' })
        .complete({ metadata: { real: true } });

      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(seen[1]);
      expect(sink.ofType('com.cart.scenario')[0].metadata).toEqual({
        real: true
      });
    });

    it('should keep calling other listeners when one throws, and report it', () => {
      const report = jest.fn();
      const { telemetry } = engine({ report });
      const seen: string[] = [];
      telemetry.scenarios.onSettled(() => {
        throw new Error('listener broke');
      });
      telemetry.scenarios.onSettled((record) => seen.push(record.scenarioName));

      expect(() =>
        telemetry.scenarios.start({ name: 'checkout' }).complete()
      ).not.toThrow();

      expect(seen).toEqual(['checkout']);
      expect(report).toHaveBeenCalledWith(
        'error',
        'scenarioTelemetry.notify failed',
        expect.any(Error)
      );
    });

    it('should stop calling a listener once it unsubscribes', () => {
      const { telemetry } = engine();
      const listener = jest.fn();
      const stop = telemetry.scenarios.onSettled(listener);

      stop();
      telemetry.scenarios.start({ name: 'checkout' }).complete();

      expect(listener).not.toHaveBeenCalled();
    });

    it('should settle a scenario that outlives its timeout, scheduling the timer through runOutside', () => {
      jest.useFakeTimers();
      let outside = 0;
      const runOutside = <T>(callback: () => T): T => {
        outside++;
        return callback();
      };
      const { telemetry, sink } = engine({
        runOutside,
        scenarios: { defaultTimeoutMs: 1_000 }
      });

      const scenario = telemetry.scenarios.start({ name: 'checkout' });
      expect(outside).toBe(1);

      jest.advanceTimersByTime(1_000);

      expect(scenario.status).toBe('timeout');
      expect(sink.ofType('com.cart.scenario')[0].status).toBe('timeout');
    });
  });

  describe('BI events', () => {
    it('should send an event, redacted, and collapse an identical one fired straight after', () => {
      const { telemetry, sink } = engine();

      telemetry.bi.track('export_clicked', { token: 'x', format: 'csv' });
      telemetry.bi.track('export_clicked', { token: 'x', format: 'csv' });

      const events = sink.ofType('com.cart.bi');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'export_clicked',
        application: 'cart',
        metadata: { token: UWT_REDACTED, format: 'csv' }
      });
    });
  });

  describe('logging', () => {
    it('should send records at or above the floor, stamped and redacted', async () => {
      const { telemetry, logApi } = engine({
        logging: { minLevel: 'warn', levels: { audit: 'log' } }
      });

      telemetry.logging.getLogger('checkout').log('dropped');
      telemetry.logging
        .getLogger('checkout')
        .warn('Slow', { metadata: { token: 'x' } });
      telemetry.logging.getLogger('audit').log('kept');

      expect(logApi.records.map((r) => r.message)).toEqual(['Slow', 'kept']);
      expect(logApi.records[0]).toMatchObject({
        level: 'warn',
        logger: 'checkout',
        application: 'cart',
        environment: 'test',
        version: '1.0.0',
        sessionId: 'session-1',
        metadata: { token: UWT_REDACTED }
      });
      expect(await telemetry.logging.query({ logger: 'audit' })).toHaveLength(
        1
      );
    });

    it('should hand out the same logger for the same name', () => {
      const { telemetry } = engine();
      expect(telemetry.logging.getLogger('checkout')).toBe(
        telemetry.logging.getLogger('checkout')
      );
    });

    it('should mirror errors to the destination when asked', () => {
      const { telemetry, sink } = engine({
        logging: { mirrorErrorsToRum: true }
      });

      telemetry.logging.getLogger('checkout').error('Payment failed');

      expect(sink.errors).toEqual([
        expect.objectContaining({ message: 'Payment failed' })
      ]);
    });

    it('should read back nothing, rather than fail, from a store that throws', async () => {
      const { telemetry, logApi } = engine();
      jest.spyOn(logApi, 'query').mockImplementation(() => {
        throw new Error('store is down');
      });

      expect(await telemetry.logging.query()).toEqual([]);
    });
  });

  describe('configuration', () => {
    it('should apply redaction overrides to every concern', () => {
      const { telemetry, sink, logApi } = engine({
        redaction: { extraKeyPatterns: [/^internal/i] }
      });

      telemetry.bi.track('export_clicked', { internalRef: 'x' });
      telemetry.logging
        .getLogger('checkout')
        .warn('x', { metadata: { internalRef: 'x' } });

      expect(sink.ofType('com.cart.bi')[0].metadata).toEqual({
        internalRef: UWT_REDACTED
      });
      expect(logApi.records[0].metadata).toEqual({
        internalRef: UWT_REDACTED
      });
    });

    it('should turn off configurable redaction for one concern only', () => {
      const { telemetry, sink } = engine({
        bi: { redact: false },
        redaction: { scanValuePatterns: ['email'] }
      });

      telemetry.bi.track('export_clicked', { note: 'jane@example.com' });
      telemetry.scenarios
        .start({ name: 'checkout', metadata: { note: 'jane@example.com' } })
        .complete();

      expect(sink.ofType('com.cart.bi')[0].metadata).toEqual({
        note: 'jane@example.com'
      });
      expect(sink.ofType('com.cart.scenario')[0].metadata).toEqual({
        note: UWT_REDACTED
      });
    });

    it('should throw when the identity, destination or log store is missing', () => {
      expect(() =>
        uwtCreateTelemetry({} as unknown as UwtTelemetryOptions)
      ).toThrow(
        '[ui-watchtower] uwtCreateTelemetry needs identity.application, destination, logApi'
      );
    });
  });

  describe('failures', () => {
    it('should never let a broken destination reach the application, and report it', () => {
      const report = jest.fn();
      const { telemetry, sink } = engine({ report });
      jest.spyOn(sink, 'record').mockImplementation(() => {
        throw new Error('destination is down');
      });

      expect(() => {
        telemetry.scenarios.start({ name: 'checkout' }).complete();
        telemetry.bi.track('export_clicked');
      }).not.toThrow();

      expect(report).toHaveBeenCalledWith(
        'error',
        'scenario.success failed',
        expect.any(Error)
      );
      expect(report).toHaveBeenCalledWith(
        'error',
        'biTelemetry.track failed',
        expect.any(Error)
      );
    });

    it('should print nothing without a reporter', () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { telemetry, sink } = engine();
      jest.spyOn(sink, 'record').mockImplementation(() => {
        throw new Error('destination is down');
      });

      telemetry.scenarios.start({ name: 'checkout' }).complete();

      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('disabled', () => {
    it('should record, send, log and watch nothing', async () => {
      jest.useFakeTimers();
      const listen = jest.spyOn(document, 'addEventListener');
      const { telemetry, sink, logApi } = engine({
        enabled: false,
        scenarios: { defaultTimeoutMs: 1_000 }
      });

      const scenario = telemetry.scenarios.start({ name: 'checkout' });
      scenario.step('pay').complete();
      telemetry.bi.track('export_clicked');
      telemetry.logging.getLogger('checkout').error('x');
      telemetry.setUserId('user-1');
      telemetry.flush();

      expect(scenario.status).toBeUndefined();
      expect(sink.events).toEqual([]);
      expect(sink.userId).toBeUndefined();
      expect(sink.flushes).toEqual([]);
      expect(logApi.records).toEqual([]);
      expect(await telemetry.logging.query()).toEqual([]);
      expect(listen).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('the page', () => {
    function hide(state: 'hidden' | 'visible'): void {
      jest.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      document.dispatchEvent(new Event('visibilitychange'));
    }

    it('should settle what is in flight as abandoned, and flush, when the page goes away', () => {
      const { telemetry, sink, logApi } = engine();
      const scenario = telemetry.scenarios.start({ name: 'checkout' });

      window.dispatchEvent(new Event('pagehide'));

      expect(scenario.status).toBe('abandoned');
      expect(sink.flushes).toEqual([true]);
      expect(logApi.flushCount).toBe(1);
    });

    it('should flush, without settling, when the page is hidden', () => {
      const { telemetry, sink, logApi } = engine();
      const scenario = telemetry.scenarios.start({ name: 'checkout' });

      hide('hidden');

      expect(scenario.isSettled).toBe(false);
      expect(sink.flushes).toEqual([true]);
      expect(logApi.flushCount).toBe(1);
    });

    it('should watch no page given null', () => {
      const { telemetry, sink } = engine({ document: null });
      const scenario = telemetry.scenarios.start({ name: 'checkout' });

      window.dispatchEvent(new Event('pagehide'));
      hide('hidden');

      expect(scenario.isSettled).toBe(false);
      expect(sink.flushes).toEqual([]);
    });
  });

  describe('setUserId and flush', () => {
    it('should pass the user to the destination, and flush it and the log store', () => {
      const { telemetry, sink, logApi } = engine();

      telemetry.setUserId('user-1');
      telemetry.flush(true);

      expect(sink.userId).toBe('user-1');
      expect(sink.flushes).toEqual([true]);
      expect(logApi.flushCount).toBe(1);
    });
  });

  describe('dispose', () => {
    it('should settle what is in flight as abandoned, flush once, and stop watching the page', () => {
      jest.useFakeTimers();
      const { telemetry, sink, logApi } = engine({
        scenarios: { defaultTimeoutMs: 60_000 }
      });
      const scenario = telemetry.scenarios.start({ name: 'checkout' });
      expect(jest.getTimerCount()).toBe(1);

      telemetry.dispose();
      telemetry.dispose();

      expect(scenario.status).toBe('abandoned');
      expect(sink.flushes).toEqual([true]);
      expect(logApi.flushCount).toBe(1);
      expect(jest.getTimerCount()).toBe(0);

      window.dispatchEvent(new Event('pagehide'));
      expect(sink.flushes).toEqual([true]);
      expect(logApi.flushCount).toBe(1);
    });

    it('should leave everything inert afterwards, with no timer or listener', () => {
      jest.useFakeTimers();
      const listener = jest.fn();
      const { telemetry, sink, logApi } = engine({
        scenarios: { defaultTimeoutMs: 60_000 }
      });
      telemetry.scenarios.onSettled(listener);
      const logger = telemetry.logging.getLogger('checkout');

      telemetry.dispose();
      const late = telemetry.scenarios.start({ name: 'checkout' });
      late.complete();
      telemetry.bi.track('export_clicked');
      logger.error('late');
      telemetry.setUserId('user-1');

      expect(late.isSettled).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
      expect(listener).not.toHaveBeenCalled();
      expect(sink.events).toEqual([]);
      expect(sink.userId).toBeUndefined();
      expect(logApi.records).toEqual([]);
    });

    it('should dispose each concern only once', () => {
      const { telemetry, logApi } = engine();

      telemetry.logging.dispose();
      telemetry.logging.dispose();
      telemetry.scenarios.dispose();
      telemetry.scenarios.dispose();

      expect(logApi.flushCount).toBe(1);
    });
  });

  describe('BI event details', () => {
    it('should drop an event without a name', () => {
      const { telemetry, sink } = engine();

      telemetry.bi.track('' as never);

      expect(sink.events).toEqual([]);
    });

    it('should write events to the console under debugBI', () => {
      localStorage.setItem('debugBI', 'true');
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      const { telemetry } = engine();

      telemetry.bi.track('export_clicked');

      expect(log).toHaveBeenCalledWith(
        '[cart][bi] export_clicked -> com.cart.bi',
        expect.objectContaining({ eventName: 'export_clicked' })
      );
      localStorage.removeItem('debugBI');
    });

    it('should forget expired events first, then the oldest, once it remembers dedupMaxKeys', () => {
      jest.useFakeTimers();
      const { telemetry, sink } = engine({
        bi: { dedupWindowMs: 1000, dedupMaxKeys: 2 }
      });
      const track = (name: string) => telemetry.bi.track(name as never);

      track('a');
      track('b');
      jest.advanceTimersByTime(1001);
      track('c'); // a and b have expired: forgotten
      track('d');
      track('e'); // nothing expired: c, the oldest, is forgotten
      track('d'); // still remembered: a duplicate
      track('c'); // forgotten, so recorded again

      expect(sink.events.map((e) => e.payload.eventName)).toEqual([
        'a',
        'b',
        'c',
        'd',
        'e',
        'c'
      ]);
    });
  });

  describe('logging details', () => {
    it('should hand out a logger that does nothing while off', () => {
      const { telemetry, logApi } = engine({ enabled: false });
      const logger = telemetry.logging.getLogger('checkout');

      logger.log('a');
      logger.warn('b');
      logger.error('c');

      expect(logApi.records).toEqual([]);
    });

    it('should write records to the console under debugLogger, with logger, context and correlation id', () => {
      localStorage.setItem('debugLogger', 'true');
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { telemetry } = engine();

      telemetry.logging
        .getLogger('checkout')
        .warn('Slow payment', { context: 'pay', correlationId: 'sc-1' });

      expect(warn).toHaveBeenCalledWith(
        '[cart][checkout][pay] Slow payment (sc-1)',
        expect.objectContaining({ message: 'Slow payment' })
      );
      localStorage.removeItem('debugLogger');
    });
  });

  describe('scenario details', () => {
    it('should report a suspicious number of scenarios in flight', () => {
      const report = jest.fn();
      const { telemetry } = engine({ report });

      for (let i = 0; i <= 50; i++) {
        telemetry.scenarios.start({ name: 'checkout' });
      }

      expect(report).toHaveBeenCalledWith(
        'warn',
        expect.stringContaining('High number of active scenarios (51)')
      );
    });

    it('should call no listener, and report, when a record cannot be copied for them', () => {
      const report = jest.fn();
      const listener = jest.fn();
      const { telemetry, sink } = engine({ report });
      telemetry.scenarios.onSettled(listener);
      const copy = uwtTelemetrySafeUtil.uwtDeepClone;
      jest
        .spyOn(uwtTelemetrySafeUtil, 'uwtDeepClone')
        .mockImplementation((value) => {
          if ((value as { scenarioName?: unknown })?.scenarioName) {
            throw new Error('cannot copy');
          }
          return copy(value);
        });

      telemetry.scenarios.start({ name: 'checkout' }).complete();

      expect(listener).not.toHaveBeenCalled();
      expect(sink.events).toHaveLength(1);
      expect(report).toHaveBeenCalledWith(
        'error',
        'scenarioTelemetry.notify failed',
        expect.any(Error)
      );
    });
  });
});
