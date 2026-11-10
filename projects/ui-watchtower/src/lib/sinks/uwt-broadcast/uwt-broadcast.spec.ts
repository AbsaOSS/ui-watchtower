/**
 * @jest-environment jsdom
 */
import { UwtLogRecord } from '../../models/uwt-log.models/uwt-log.models';
import {
  UWT_TELEMETRY_EVENT_TYPE,
  UwtTelemetryError,
  UwtTelemetryMetadata
} from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import { uwtMarkSessionStart } from '../../utils/uwt-session-start.util/uwt-session-start.util';
import { UwtTelemetrySink } from '../uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import {
  UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS,
  UwtBroadcastLogApiProvider
} from '../../providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';
import { UwtNoopLogApiProvider } from '../../providers/uwt-noop-log-api.provider/uwt-noop-log-api.provider';
import { UwtNoopTelemetrySink } from '../uwt-telemetry/uwt-noop-telemetry.sink/uwt-noop-telemetry.sink';
import { UwtTelemetryBroadcastHost } from './uwt-broadcast-host';
import { UwtBroadcastTelemetrySink } from './uwt-broadcast-telemetry.sink';
import {
  UWT_DEFAULT_BROADCAST_CHANNEL,
  uwtConnectBroadcastChannel
} from './uwt-broadcast.messages';

/**
 * `BroadcastChannel` for the test: delivers asynchronously to every other
 * open instance of the same name.
 */
class ChannelStub {
  static readonly open = new Set<ChannelStub>();
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly name: string) {
    ChannelStub.open.add(this);
  }

  postMessage(message: unknown): void {
    for (const peer of ChannelStub.open) {
      if (peer !== this && peer.name === this.name) {
        const data = JSON.parse(JSON.stringify(message));
        setTimeout(() => peer.onmessage?.({ data }), 0);
      }
    }
  }

  close(): void {
    ChannelStub.open.delete(this);
  }
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const identity = { application: 'cart', environment: 'test', version: '1' };

describe('the core broadcast classes', () => {
  let hosts: UwtTelemetryBroadcastHost[];

  /** A host, disposed after the test whatever happens. */
  function hostOf(
    options: ConstructorParameters<typeof UwtTelemetryBroadcastHost>[0]
  ): UwtTelemetryBroadcastHost {
    const host = new UwtTelemetryBroadcastHost(options);
    hosts.push(host);
    return host;
  }

  beforeEach(() => {
    hosts = [];
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: ChannelStub,
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    hosts.forEach((host) => host.dispose());
    ChannelStub.open.clear();
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('a shared connection', () => {
    it('should serve a sink and a log provider over one channel', async () => {
      const connection = uwtConnectBroadcastChannel();
      const sink = new UwtBroadcastTelemetrySink({ identity, connection });
      const logApi = new UwtBroadcastLogApiProvider({ connection });
      const host = hostOf({
        sink: new UwtNoopTelemetrySink(),
        logApi: {
          send: () => undefined,
          query: async () => [record('found')]
        }
      });
      await settle();

      expect(ChannelStub.open.size).toBe(2);
      const query = logApi.query({});
      await settle();
      expect((await query).map((r) => r.message)).toEqual(['found']);

      sink.flush();
      await settle();
      expect(host.received).toBe(2);
      sink.dispose();
      logApi.dispose();
      connection.close();
    });

    it('should be closed by whoever opened it, not by those it was lent to', () => {
      const connection = uwtConnectBroadcastChannel();
      const sink = new UwtBroadcastTelemetrySink({ identity, connection });
      const logApi = new UwtBroadcastLogApiProvider({ connection });

      sink.dispose();
      logApi.dispose();
      expect(connection.isOpen()).toBe(true);

      connection.close();
      expect(ChannelStub.open.size).toBe(0);
    });

    it('should be opened, and closed, by a sink given none', () => {
      const sink = new UwtBroadcastTelemetrySink({ identity });
      expect(ChannelStub.open.size).toBe(1);

      sink.dispose();
      sink.dispose();
      expect(ChannelStub.open.size).toBe(0);
    });

    it('should open nothing while disabled', async () => {
      const sink = new UwtBroadcastTelemetrySink({ identity, enabled: false });
      const logApi = new UwtBroadcastLogApiProvider({ enabled: false });

      expect(ChannelStub.open.size).toBe(0);
      expect(() => sink.record('com.uwt.bi', {})).not.toThrow();
      await expect(logApi.query({})).resolves.toEqual([]);
    });

    it('should send nothing over a shared connection while disabled, and leave it open', async () => {
      const shell = new ChannelStub(UWT_DEFAULT_BROADCAST_CHANNEL);
      const heard: unknown[] = [];
      shell.onmessage = ({ data }) => heard.push(data);
      const connection = uwtConnectBroadcastChannel();
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

      const sink = new UwtBroadcastTelemetrySink({
        identity,
        connection,
        enabled: false
      });
      const logApi = new UwtBroadcastLogApiProvider({
        connection,
        enabled: false
      });
      sink.record('com.uwt.bi', { eventName: 'x' });
      sink.recordError({ name: 'Error', message: 'boom' });
      sink.flush(true);
      logApi.send(record('hi'));
      const query = logApi.query({});

      expect(jest.getTimerCount()).toBe(0);
      await expect(query).resolves.toEqual([]);
      jest.useRealTimers();
      await settle();
      expect(heard).toEqual([]);
      sink.dispose();
      logApi.dispose();
      expect(connection.isOpen()).toBe(true);
      connection.close();
    });
  });

  describe('the forwarding sink', () => {
    it("should forward with its realm's origin, and adopt the identity the host announces", async () => {
      const shell = new ChannelStub(UWT_DEFAULT_BROADCAST_CHANNEL);
      const heard: Record<string, unknown>[] = [];
      shell.onmessage = ({ data }) =>
        heard.push(data as Record<string, unknown>);
      const sink = new UwtBroadcastTelemetrySink({ identity });

      sink.record('com.uwt.bi', { eventName: 'x' }, { feature: 'cart' });
      sink.recordError({ name: 'Error', message: 'boom' });
      sink.setUserId('u-1');
      sink.flush(true);
      shell.postMessage({
        kind: 'identity',
        sessionId: 'shell-session',
        userId: 'shell-user'
      });
      shell.postMessage({ kind: 'nonsense' });
      await settle();

      const origin = {
        application: 'cart',
        environment: 'test',
        appVersion: '1'
      };
      expect(heard).toEqual([
        { kind: 'identity-request' },
        {
          kind: 'event',
          eventType: 'com.uwt.bi',
          payload: { eventName: 'x' },
          metadata: { feature: 'cart', ...origin }
        },
        {
          kind: 'error',
          error: { name: 'Error', message: 'boom' },
          metadata: origin
        },
        { kind: 'user', userId: 'u-1' },
        { kind: 'flush', beacon: true }
      ]);
      expect(sink.getSessionId()).toBe('shell-session');
      expect(sink.getUserId()).toBe('shell-user');
      sink.dispose();
    });
  });

  describe('a log query', () => {
    it('should resolve to [] when no host answers in time, its timer scheduled through runOutside', async () => {
      jest.useFakeTimers();
      let outside = 0;
      const logApi = new UwtBroadcastLogApiProvider({
        runOutside: (callback) => {
          outside++;
          return callback();
        }
      });

      const query = logApi.query({});
      jest.advanceTimersByTime(UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS);

      await expect(query).resolves.toEqual([]);
      expect(outside).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
      logApi.dispose();
    });

    it('should resolve to [] when the provider is disposed, leaving no timer', async () => {
      jest.useFakeTimers();
      const logApi = new UwtBroadcastLogApiProvider();

      const query = logApi.query({});
      logApi.dispose();

      await expect(query).resolves.toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('the host', () => {
    const shell = () => ({
      sink: new UwtNoopTelemetrySink(),
      logApi: new UwtNoopLogApiProvider()
    });

    it('should report a second host in this realm to its reporter', () => {
      const report = jest.fn();
      const first = hostOf({ ...shell(), report });
      const second = hostOf({ ...shell(), report });

      expect(report).toHaveBeenCalledWith(
        'config',
        expect.stringContaining('a second telemetry host is active')
      );
      first.dispose();
      second.dispose();
    });

    it('should warn on the console without a reporter: a misconfigured host is never silent', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const forwarding = hostOf({
        sink: new UwtBroadcastTelemetrySink({ identity }),
        logApi: new UwtNoopLogApiProvider()
      });

      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/^\[ui-watchtower\] .*cannot also host it/)
      );
      forwarding.dispose();
    });

    it('should neither count nor open anything while disabled', () => {
      const report = jest.fn();
      const disabled = hostOf({
        ...shell(),
        enabled: false,
        report
      });
      const active = hostOf({ ...shell(), report });

      expect(report).not.toHaveBeenCalled();
      expect(ChannelStub.open.size).toBe(1);
      disabled.dispose();
      active.dispose();
    });

    it('should give up its place only once, however often it is disposed', () => {
      const report = jest.fn();
      const first = hostOf({ ...shell(), report });
      const second = hostOf({ ...shell(), report });
      second.dispose();
      second.dispose();
      report.mockClear();

      const third = hostOf({ ...shell(), report });

      expect(report).toHaveBeenCalledWith(
        'config',
        expect.stringContaining('a second telemetry host is active')
      );
      first.dispose();
      third.dispose();
    });
  });

  describe('the host, relaying a fragment', () => {
    /** The shell's real destination; its session and user can move on. */
    class ShellSink extends UwtTelemetrySink {
      sessionId?: string = 'shell-session';
      userId?: string = 'shell-user';
      readonly calls = {
        record: jest.fn(),
        recordError: jest.fn(),
        flush: jest.fn(),
        setUserId: jest.fn()
      };

      record(
        eventType: string,
        payload: object,
        metadata?: UwtTelemetryMetadata
      ): void {
        this.calls.record(eventType, payload, metadata);
      }

      recordError(
        error: UwtTelemetryError,
        metadata?: UwtTelemetryMetadata
      ): void {
        this.calls.recordError(error, metadata);
      }

      flush(beacon?: boolean): void {
        this.calls.flush(beacon);
      }

      getSessionId(): string | undefined {
        return this.sessionId;
      }

      getUserId(): string | undefined {
        return this.userId;
      }

      setUserId(userId: string | undefined): void {
        this.userId = userId;
        this.calls.setUserId(userId);
      }
    }

    let sink: ShellSink;
    let logApi: { send: jest.Mock; query: jest.Mock; flush: jest.Mock };
    /** A fragment's end of the channel: what it sends, and what it hears. */
    let fragment: {
      send: (message: unknown) => void;
      heard: Record<string, unknown>[];
    };
    const recorded = () => sink.calls.record.mock.calls.map(([, p]) => p);
    const heardOf = (kind: string) =>
      fragment.heard.filter((message) => message.kind === kind);

    beforeEach(() => {
      localStorage.clear();
      sink = new ShellSink();
      logApi = {
        send: jest.fn(),
        query: jest.fn(async () => [record('found')]),
        flush: jest.fn()
      };
      hostOf({ sink, logApi });
      const channel = new ChannelStub(UWT_DEFAULT_BROADCAST_CHANNEL);
      const heard: Record<string, unknown>[] = [];
      channel.onmessage = ({ data }) =>
        heard.push(data as Record<string, unknown>);
      fragment = { send: (message) => channel.postMessage(message), heard };
    });

    it("should record a forwarded scenario under the shell's session and user, measuring the session again", async () => {
      uwtMarkSessionStart('shell-session', Date.now() - 2000);

      fragment.send({
        kind: 'event',
        eventType: UWT_TELEMETRY_EVENT_TYPE.scenario,
        payload: {
          scenarioName: 'checkout',
          sessionId: 'stale',
          userId: 'stale-user',
          sessionElapsed: 5
        },
        metadata: { application: 'cart' }
      });
      await settle();

      const [[eventType, payload, metadata]] = sink.calls.record.mock.calls;
      expect(eventType).toBe(UWT_TELEMETRY_EVENT_TYPE.scenario);
      expect(payload).toMatchObject({
        scenarioName: 'checkout',
        sessionId: 'shell-session',
        userId: 'shell-user'
      });
      expect(payload.sessionElapsed).toBeGreaterThanOrEqual(2000);
      expect(metadata).toEqual({ application: 'cart' });
    });

    it('should drop an elapsed time it cannot measure, and pass up-to-date or unknown records as they are', async () => {
      fragment.send({
        kind: 'event',
        eventType: UWT_TELEMETRY_EVENT_TYPE.scenario,
        payload: { scenarioName: 'a', sessionId: 'stale', sessionElapsed: 5 }
      });
      fragment.send({
        kind: 'event',
        eventType: UWT_TELEMETRY_EVENT_TYPE.bi,
        payload: {
          eventName: 'x',
          sessionId: 'shell-session',
          userId: 'shell-user'
        }
      });
      fragment.send({
        kind: 'event',
        eventType: 'com.other.event',
        payload: { sessionId: 'stale' }
      });
      fragment.send({ kind: 'event', eventType: 1 });
      await settle();

      expect(recorded()).toEqual([
        { scenarioName: 'a', sessionId: 'shell-session', userId: 'shell-user' },
        { eventName: 'x', sessionId: 'shell-session', userId: 'shell-user' },
        { sessionId: 'stale' }
      ]);
    });

    it('should relay errors, the user and flushes, and answer identity requests', async () => {
      fragment.send({
        kind: 'error',
        error: { name: 'TypeError', message: 'boom' },
        metadata: { application: 'cart' }
      });
      fragment.send({ kind: 'flush', beacon: true });
      fragment.send({ kind: 'user', userId: 'new-user' });
      fragment.send({ kind: 'identity-request' });
      // Another tab's host: expected on an origin-wide channel, and ignored.
      fragment.send({ kind: 'identity', sessionId: 'other-tab' });
      await settle();

      expect(sink.calls.recordError).toHaveBeenCalledWith(
        { name: 'TypeError', message: 'boom' },
        { application: 'cart' }
      );
      expect(sink.calls.flush).toHaveBeenCalledWith(true);
      expect(sink.calls.setUserId).toHaveBeenCalledWith('new-user');
      expect(heardOf('identity')).toEqual([
        { kind: 'identity', sessionId: 'shell-session', userId: 'new-user' },
        { kind: 'identity', sessionId: 'shell-session', userId: 'new-user' }
      ]);
    });

    it("should announce the shell's identity again once its session moves on", async () => {
      sink.sessionId = 'renewed';

      fragment.send({
        kind: 'event',
        eventType: 'com.other.event',
        payload: {}
      });
      await settle();

      expect(heardOf('identity')).toEqual([
        { kind: 'identity', sessionId: 'renewed', userId: 'shell-user' }
      ]);
    });

    it("should deliver forwarded log lines under the shell's identity, and flush the log store", async () => {
      fragment.send({
        kind: 'log',
        record: { ...record('hi'), sessionId: 'stale' }
      });
      fragment.send({ kind: 'log-flush' });
      await settle();

      expect(logApi.send).toHaveBeenCalledWith({
        ...record('hi'),
        sessionId: 'shell-session',
        userId: 'shell-user'
      });
      expect(logApi.flush).toHaveBeenCalled();
    });

    it('should answer a log query with [] when the log store throws, rejects or returns no list', async () => {
      logApi.query
        .mockImplementationOnce(() => {
          throw new Error('down');
        })
        .mockRejectedValueOnce(new Error('down'))
        .mockReturnValueOnce('not records');

      for (const id of ['q1', 'q2', 'q3']) {
        fragment.send({ kind: 'log-query', id, filter: {} });
      }
      await settle();

      const answers = heardOf('log-query-result');
      expect(answers).toHaveLength(3);
      expect(answers).toEqual(
        expect.arrayContaining(
          ['q1', 'q2', 'q3'].map((id) => ({
            kind: 'log-query-result',
            id,
            records: []
          }))
        )
      );
    });
  });
});

function record(message: string): UwtLogRecord {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'log',
    message,
    application: 'shell',
    environment: 'test',
    version: '1'
  };
}
