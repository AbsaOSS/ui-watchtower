/**
 * @jest-environment jsdom
 */
import { UwtRumBootstrap } from '../uwt-rum-credentials/uwt-rum-credentials';
import {
  UwtRumTelemetrySink,
  UwtRumTelemetrySinkOptions
} from './uwt-rum-telemetry.sink';

const mockClient = {
  recordEvent: jest.fn(),
  recordError: jest.fn(),
  recordPageView: jest.fn(),
  addSessionAttributes: jest.fn(),
  setEventMetadataHook: jest.fn(),
  setAwsCredentials: jest.fn(),
  getSessionId: jest.fn(() => 'session-1'),
  getUserId: jest.fn(),
  pinUserId: jest.fn(),
  startSession: jest.fn(),
  dispatch: jest.fn(),
  dispatchBeacon: jest.fn(),
  disable: jest.fn()
};
const mockLoads = { count: 0 };

jest.mock('aws-rum-web', () => {
  mockLoads.count++;
  return {
    AwsRum: function () {
      return mockClient;
    }
  };
});

/** What a broker returns: settings, and credentials an hour from expiry. */
function bootstrap(
  config: Partial<UwtRumBootstrap['config']> = {}
): UwtRumBootstrap {
  return {
    config: {
      applicationId: 'app-monitor',
      applicationVersion: '1.0.0',
      region: 'eu-west-1',
      ...config
    },
    credentials: {
      accessKeyId: 'a',
      secretAccessKey: 's',
      sessionToken: 't',
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }
  };
}

describe('the core RUM sink', () => {
  let load: jest.Mock;
  let sinks: UwtRumTelemetrySink[];

  function sink(
    options: Partial<UwtRumTelemetrySinkOptions> = {}
  ): UwtRumTelemetrySink {
    const created = new UwtRumTelemetrySink({
      identity: { application: 'cart', environment: 'test', version: '1' },
      credentialsProvider: { load },
      ...options
    });
    sinks.push(created);
    return created;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    load = jest.fn(async () => bootstrap());
    sinks = [];
  });

  afterEach(() => {
    sinks.forEach((created) => created.dispose());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should never start without a page: no credentials request, no SDK', async () => {
    const serverSink = sink({ document: null });
    const loadsBefore = mockLoads.count;

    await serverSink.init();
    serverSink.record('com.uwt.bi', { eventName: 'x' });

    expect(load).not.toHaveBeenCalled();
    expect(mockLoads.count).toBe(loadsBefore);
    expect(serverSink.getSessionId()).toBeUndefined();
  });

  it('should never start while disabled', async () => {
    await sink({ enabled: false }).init();

    expect(load).not.toHaveBeenCalled();
  });

  it('should start outside change detection, then record through the client', async () => {
    let outside = 0;
    const started = sink({
      runOutside: (callback) => {
        outside++;
        return callback();
      }
    });

    await started.init();
    started.record('com.uwt.bi', { eventName: 'x' }, { feature: 'cart' });

    expect(outside).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(mockClient.setAwsCredentials).toHaveBeenCalled();
    expect(mockClient.recordEvent).toHaveBeenCalledWith(
      'com.uwt.bi',
      { eventName: 'x' },
      { feature: 'cart' }
    );
    expect(started.getSessionId()).toBe('session-1');
  });

  it('should replay what it was given before the client started', async () => {
    const started = sink();

    started.record('com.uwt.bi', { eventName: 'early' });
    await started.init();

    expect(mockClient.recordEvent).toHaveBeenCalledWith(
      'com.uwt.bi',
      { eventName: 'early' },
      undefined
    );
  });

  it("should report settings that keep RUM from starting as a 'config' problem", async () => {
    const report = jest.fn();
    load.mockResolvedValue(
      bootstrap({ pagesToInclude: ['not a RegExp'] as unknown as RegExp[] })
    );

    await sink({ report }).init();

    expect(mockClient.recordEvent).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      'config',
      'RUM not started, settings of the wrong type: pagesToInclude (expected an array of RegExp)'
    );
  });

  it('should print those settings to the console without a reporter: RUM off is never silent', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    load.mockResolvedValue(
      bootstrap({ pagesToInclude: ['not a RegExp'] as unknown as RegExp[] })
    );

    await sink().init();

    expect(warn).toHaveBeenCalledWith(
      '[ui-watchtower] RUM not started, settings of the wrong type: pagesToInclude (expected an array of RegExp)'
    );
  });

  it('should stop the client, and leave no refresh pending, once disposed', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const started = sink();
    await started.init();
    expect(jest.getTimerCount()).toBe(1);

    started.dispose();
    started.dispose();

    expect(mockClient.disable).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    started.record('com.uwt.bi', { eventName: 'late' });
    expect(mockClient.recordEvent).not.toHaveBeenCalled();
  });
});
