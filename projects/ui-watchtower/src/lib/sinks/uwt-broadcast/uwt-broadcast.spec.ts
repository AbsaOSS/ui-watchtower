/**
 * @jest-environment jsdom
 */
import { UwtLogRecord } from '../../models/uwt-log.models/uwt-log.models';
import {
  UWT_BROADCAST_LOG_QUERY_TIMEOUT_MS,
  UwtBroadcastLogApiProvider
} from '../../providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';
import { UwtNoopLogApiProvider } from '../../providers/uwt-noop-log-api.provider/uwt-noop-log-api.provider';
import { UwtNoopTelemetrySink } from '../uwt-telemetry/uwt-noop-telemetry.sink/uwt-noop-telemetry.sink';
import { UwtTelemetryBroadcastHost } from './uwt-broadcast-host';
import { UwtBroadcastTelemetrySink } from './uwt-broadcast-telemetry.sink';
import { uwtConnectBroadcastChannel } from './uwt-broadcast.messages';

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
