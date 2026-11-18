/**
 * @jest-environment jsdom
 */
import { uwtSessionElapsed } from '@absaoss-cps/ui-watchtower';
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
  getSessionId: jest.fn(),
  getUserId: jest.fn(),
  pinUserId: jest.fn(),
  startSession: jest.fn(),
  dispatch: jest.fn(),
  dispatchBeacon: jest.fn(),
  disable: jest.fn()
};
/** The arguments of every client built, and what building one does. */
const mockConstructed: unknown[][] = [];
const mockConstruction: { fail: boolean; then?: () => void } = { fail: false };

jest.mock('aws-rum-web', () => ({
  AwsRum: function (...args: unknown[]) {
    if (mockConstruction.fail) {
      throw new Error('SDK exploded');
    }
    mockConstructed.push(args);
    mockConstruction.then?.();
    return mockClient;
  }
}));

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const SESSION_START = 'com.amazon.rum.session_start_event';

/** What a broker returns: settings, and credentials expiring in an hour. */
function bootstrap(
  config: Record<string, unknown> = {},
  expiresInMs = HOUR
): UwtRumBootstrap {
  return {
    config: {
      applicationId: 'app-monitor',
      applicationVersion: '1.0.0',
      region: 'eu-west-1',
      ...config
    } as UwtRumBootstrap['config'],
    credentials: {
      accessKeyId: 'a',
      secretAccessKey: 's',
      sessionToken: 't',
      expiration: new Date(Date.now() + expiresInMs).toISOString()
    }
  };
}

/** A page with an origin and its cookies. */
function page(origin = 'https://shop.example') {
  return {
    cookie: '',
    defaultView: { location: { origin }, navigator: { cookieEnabled: true } }
  };
}

/** The config the last client was built with. */
function builtConfig(): Record<string, unknown> {
  return mockConstructed[mockConstructed.length - 1][3] as Record<
    string,
    unknown
  >;
}

/** The metadata hook the client was given. */
function metadataHook(): (type: string) => Record<string, unknown> {
  return mockClient.setEventMetadataHook.mock.calls[0][0];
}

describe('the core RUM sink, in detail', () => {
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
    Object.values(mockClient).forEach((fn) => fn.mockReset());
    mockClient.getSessionId.mockReturnValue('session-1');
    mockConstructed.length = 0;
    mockConstruction.fail = false;
    mockConstruction.then = undefined;
    load = jest.fn(async () => bootstrap());
    sinks = [];
    localStorage.clear();
  });

  afterEach(() => {
    sinks.forEach((created) => created.dispose());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('settings the SDK cannot use', () => {
    it.each([
      [
        { pagesToExclude: 'admin' },
        'pagesToExclude (expected an array of RegExp)'
      ],
      [{ telemetries: 'errors' }, 'telemetries (expected an array)'],
      [
        { telemetries: [['http', { urlsToExclude: ['/files'] }]] },
        'http.urlsToExclude (expected an array of RegExp)'
      ],
      [
        { telemetries: [['http', { addXRayTraceIdHeader: 'yes' }]] },
        'http.addXRayTraceIdHeader (expected a boolean or an array of RegExp)'
      ],
      [
        { telemetries: [['errors', { ignore: 'never' }]] },
        'errors.ignore (expected a function)'
      ]
    ])('should keep RUM off for %j', async (config, problem) => {
      const report = jest.fn();
      load.mockResolvedValue(bootstrap(config));
      const created = sink({ report });

      await created.init();
      created.record('com.uwt.bi', {});

      expect(mockConstructed).toHaveLength(0);
      expect(report).toHaveBeenCalledWith(
        'config',
        `RUM not started, settings of the wrong type: ${problem}`
      );
    });

    it('should accept valid telemetry options, and pass them on without the unset ones', async () => {
      const ignore = () => false;
      const pattern = /\/api\//;
      load.mockResolvedValue(
        bootstrap({
          telemetries: [
            'errors',
            ['errors', { ignore }],
            [
              'http',
              {
                urlsToExclude: [pattern],
                addXRayTraceIdHeader: true,
                urlsToInclude: null,
                interactionId: undefined
              }
            ],
            ['performance', 'not options']
          ]
        })
      );

      await sink().init();

      expect(builtConfig().telemetries).toEqual([
        'errors',
        ['errors', { ignore }],
        ['http', { urlsToExclude: [pattern], addXRayTraceIdHeader: true }],
        ['performance', 'not options']
      ]);
    });
  });

  describe('the client config', () => {
    it('should trace same-origin requests by default, never a look-alike host', async () => {
      await sink({ document: page('https://shop.example') }).init();

      const http = (builtConfig().telemetries as unknown[])[2] as [
        string,
        { addXRayTraceIdHeader: RegExp[] }
      ];
      const [sameOrigin] = http[1].addXRayTraceIdHeader;
      expect(sameOrigin.test('https://shop.example/api/orders')).toBe(true);
      expect(sameOrigin.test('https://shop.example')).toBe(true);
      expect(sameOrigin.test('https://shop.example.attacker.example/')).toBe(
        false
      );
      expect(builtConfig()).toMatchObject({
        allowCookies: true,
        enableXRay: true,
        endpoint: 'https://dataplane.rum.eu-west-1.amazonaws.com'
      });
    });

    it("should leave unset settings to the SDK's defaults, and pass set ones on", async () => {
      load.mockResolvedValue(
        bootstrap({
          sessionSampleRate: 0.5,
          client: 'my-client',
          releaseId: null,
          debug: undefined
        })
      );

      await sink().init();

      expect(builtConfig()).toMatchObject({
        sessionSampleRate: 0.5,
        client: 'my-client'
      });
      expect(builtConfig()).not.toHaveProperty('releaseId');
      expect(builtConfig()).not.toHaveProperty('debug');
    });
  });

  describe('startup', () => {
    it('should turn RUM off for the page when the broker declines', async () => {
      load.mockResolvedValue(null);
      const created = sink();

      created.record('com.uwt.early', {});
      await created.init();
      created.record('com.uwt.late', {});

      expect(mockConstructed).toHaveLength(0);
      expect(created.getSessionId()).toBeUndefined();
    });

    it('should retry a failing broker with growing delays, then start and replay', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const report = jest.fn();
      load
        .mockRejectedValueOnce(new Error('broker down'))
        .mockRejectedValueOnce(new Error('still down'));
      const created = sink({ report });

      created.record('com.uwt.early', {});
      await created.init();
      await jest.advanceTimersByTimeAsync(1000);
      expect(load).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(2000);

      expect(load).toHaveBeenCalledTimes(3);
      expect(mockClient.recordEvent).toHaveBeenCalledWith(
        'com.uwt.early',
        {},
        undefined
      );
      expect(
        report.mock.calls.filter(([, message]) => message.includes('retrying'))
      ).toEqual([
        [
          'warn',
          'RUM init failed, retrying',
          expect.objectContaining({ message: 'broker down' })
        ]
      ]);
    });

    it('should give up after five minutes of failures, and drop what it held', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const report = jest.fn();
      load.mockRejectedValue(new Error('down'));
      const created = sink({ report });

      created.record('com.uwt.early', {});
      await created.init();
      await jest.advanceTimersByTimeAsync(6 * MINUTE);
      const attempts = load.mock.calls.length;
      await jest.advanceTimersByTimeAsync(10 * MINUTE);

      expect(report).toHaveBeenCalledWith(
        'warn',
        'RUM init failed, monitoring disabled',
        expect.objectContaining({ message: 'down' })
      );
      expect(load).toHaveBeenCalledTimes(attempts);
      expect(mockConstructed).toHaveLength(0);
    });

    it('should turn RUM off when the client fails to start, reporting only to a reporter', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const report = jest.fn();
      mockConstruction.fail = true;

      await sink({ report }).init();
      await sink().init();

      expect(report).toHaveBeenCalledWith(
        'warn',
        'RUM init failed, monitoring disabled',
        expect.objectContaining({ message: 'SDK exploded' })
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('should build no client when disposed while starting', async () => {
      const created = sink();

      const starting = created.init();
      created.dispose();
      await starting;

      expect(mockConstructed).toHaveLength(0);
    });

    it('should hold the latest 100 events from before startup', async () => {
      const created = sink();

      for (let i = 0; i < 105; i++) {
        created.record(`com.uwt.e${i}`, {});
      }
      await created.init();

      expect(mockClient.recordEvent).toHaveBeenCalledTimes(100);
      expect(mockClient.recordEvent.mock.calls[0][0]).toBe('com.uwt.e5');
    });
  });

  describe('records', () => {
    it('should drop reserved and null metadata, and send none when nothing is left', async () => {
      const created = sink();
      await created.init();

      created.record('com.uwt.a', {}, { 'aws:x': 'a', keep: 1, gone: null });
      created.record('com.uwt.b', {}, { 'aws:only': 'a' });

      expect(mockClient.recordEvent.mock.calls).toEqual([
        ['com.uwt.a', {}, { keep: 1 }],
        ['com.uwt.b', {}, undefined]
      ]);
    });

    it("should fold a fragment's application into an error's name, not its own", async () => {
      const created = sink();
      await created.init();
      const error = { name: 'TypeError', message: 'boom' };

      created.recordError(error, { application: 'checkout' });
      created.recordError(error, { application: 'cart' });
      created.recordError(error);

      expect(mockClient.recordError.mock.calls).toEqual([
        [{ name: '[checkout] TypeError', message: 'boom' }],
        [error],
        [error]
      ]);
    });

    it('should replay page views and errors recorded before startup', async () => {
      const created = sink();

      created.recordPageView('/customers/:id');
      created.recordError(
        { name: 'Error', message: 'early' },
        { application: 'checkout' }
      );
      await created.init();
      created.recordPageView('/orders');

      expect(mockClient.recordPageView.mock.calls).toEqual([
        ['/customers/:id'],
        ['/orders']
      ]);
      expect(mockClient.recordError).toHaveBeenCalledWith({
        name: '[checkout] Error',
        message: 'early'
      });
    });
  });

  describe('the signed-in user', () => {
    it('should pin a user signed in before startup, once the client starts', async () => {
      const created = sink();

      created.setUserId('u-1');
      await created.init();

      expect(created.getUserId()).toBe('u-1');
      expect(mockClient.pinUserId).toHaveBeenCalledWith('u-1');
    });

    it('should start an anonymous session for a sign-out before startup', async () => {
      const created = sink();

      created.setUserId('u-1');
      created.setUserId(undefined);
      await created.init();

      expect(mockClient.pinUserId).not.toHaveBeenCalled();
      expect(mockClient.startSession).toHaveBeenCalledWith({
        userId: expect.any(String)
      });
    });

    it('should send what the client holds before the user changes, and ignore repeats', async () => {
      load.mockResolvedValue(
        bootstrap({ eventCacheSize: 300, batchLimit: 100 })
      );
      const created = sink();
      await created.init();

      created.setUserId('u-1');
      expect(mockClient.dispatch).toHaveBeenCalledTimes(3);
      expect(mockClient.pinUserId).toHaveBeenCalledWith('u-1');

      created.setUserId('u-1');
      expect(mockClient.dispatch).toHaveBeenCalledTimes(3);

      created.setUserId(undefined);
      expect(mockClient.dispatch).toHaveBeenCalledTimes(6);
      expect(mockClient.startSession).toHaveBeenCalledTimes(1);

      created.setUserId('');
      expect(mockClient.startSession).toHaveBeenCalledTimes(1);
    });

    it('should send one batch when the batch settings are unusable', async () => {
      load.mockResolvedValue(bootstrap({ batchLimit: 0 }));
      const created = sink();
      await created.init();

      created.setUserId('u-1');

      expect(mockClient.dispatch).toHaveBeenCalledTimes(1);
    });

    it('should not send early when the client already has that user, as after a reload', async () => {
      mockClient.getUserId.mockReturnValue('u-1');
      const created = sink();
      await created.init();

      created.setUserId('u-1');

      expect(mockClient.dispatch).not.toHaveBeenCalled();
      expect(mockClient.pinUserId).toHaveBeenCalledWith('u-1');
    });

    it('should stamp signedIn on events only once the app has said who is signed in', async () => {
      const created = sink();
      await created.init();
      const hook = metadataHook();

      expect(hook('com.uwt.bi')).toEqual({
        application: 'cart',
        environment: 'test',
        appVersion: '1'
      });
      created.setUserId('u-1');
      expect(hook('com.uwt.bi')).toMatchObject({ signedIn: true });
      created.setUserId(undefined);
      expect(hook('com.uwt.bi')).toMatchObject({ signedIn: false });
    });
  });

  describe('session starts', () => {
    it('should record when the client starts a session', async () => {
      await sink().init();

      metadataHook()(SESSION_START);

      expect(uwtSessionElapsed('session-1')).toEqual(expect.any(Number));
    });

    it('should record nothing when the client keeps no session cookie', async () => {
      load.mockResolvedValue(bootstrap({ allowCookies: false }));
      await sink().init();

      metadataHook()(SESSION_START);

      expect(uwtSessionElapsed('session-1')).toBeUndefined();
    });

    it.each([
      ['the shared cookie', {}, 'cwr_s=1'],
      [
        'its own cookie',
        { cookieAttributes: { unique: true } },
        'cwr_s_app-monitor=1'
      ]
    ])(
      'should record the session the client starts while starting, in %s',
      async (_, config, cookie) => {
        const document = page();
        mockConstruction.then = () => {
          document.cookie = cookie;
        };
        load.mockResolvedValue(bootstrap(config));

        await sink({ document }).init();

        expect(uwtSessionElapsed('session-1')).toEqual(expect.any(Number));
      }
    );

    it('should not recurse when reading the session id starts another one', async () => {
      await sink().init();
      const hook = metadataHook();
      mockClient.getSessionId.mockImplementationOnce(() => {
        hook(SESSION_START);
        return 'session-2';
      });

      hook(SESSION_START);

      expect(mockClient.getSessionId).toHaveBeenCalledTimes(1);
      expect(uwtSessionElapsed('session-2')).toEqual(expect.any(Number));
    });
  });

  describe('flush', () => {
    it('should send through the client, by beacon when asked', async () => {
      const created = sink();
      await created.init();

      created.flush();
      created.flush(true);

      expect(mockClient.dispatch).toHaveBeenCalledTimes(1);
      expect(mockClient.dispatchBeacon).toHaveBeenCalledTimes(1);
    });

    it('should report events lost when the page goes before the client starts', () => {
      load.mockReturnValue(new Promise(() => undefined));
      const report = jest.fn();
      const created = sink({ report });

      created.flush(true);
      expect(report).not.toHaveBeenCalled();
      created.record('com.uwt.early', {});
      created.flush(true);

      expect(report).toHaveBeenCalledWith(
        'warn',
        '1 RUM event(s) lost: page unloaded before RUM finished initializing'
      );
    });
  });

  describe('credentials', () => {
    beforeEach(() =>
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] })
    );

    it('should refresh credentials five minutes before they expire', async () => {
      await sink().init();

      await jest.advanceTimersByTimeAsync(HOUR - 5 * MINUTE);

      expect(load).toHaveBeenCalledTimes(2);
      expect(mockClient.setAwsCredentials).toHaveBeenCalledTimes(2);
    });

    it('should turn RUM off when a refresh is declined', async () => {
      const created = sink();
      await created.init();
      load.mockResolvedValueOnce(null);

      await jest.advanceTimersByTimeAsync(HOUR - 5 * MINUTE);
      created.record('com.uwt.late', {});

      expect(mockClient.disable).toHaveBeenCalled();
      expect(mockClient.recordEvent).not.toHaveBeenCalled();
    });

    it('should keep its credentials and retry when a refresh omits them, or fails', async () => {
      const report = jest.fn();
      await sink({ report }).init();
      load
        .mockResolvedValueOnce({ config: bootstrap().config })
        .mockRejectedValueOnce(new Error('broker down'));

      await jest.advanceTimersByTimeAsync(HOUR - 5 * MINUTE);
      expect(report).toHaveBeenCalledWith(
        'warn',
        'RUM credential refresh',
        expect.objectContaining({
          message: expect.stringContaining('omitted credentials')
        })
      );
      await jest.advanceTimersByTimeAsync(30 * 1000);
      expect(report).toHaveBeenCalledWith(
        'warn',
        'RUM credential refresh failed',
        expect.objectContaining({ message: 'broker down' })
      );
      await jest.advanceTimersByTimeAsync(30 * 1000);

      expect(load).toHaveBeenCalledTimes(4);
      expect(mockClient.setAwsCredentials).toHaveBeenCalledTimes(2);
    });

    it('should retry soon, not loop, on credentials already expired', async () => {
      load.mockResolvedValueOnce(bootstrap({}, -1000));
      await sink().init();
      expect(jest.getTimerCount()).toBe(1);

      await jest.advanceTimersByTimeAsync(30 * 1000);

      expect(load).toHaveBeenCalledTimes(2);
      expect(mockClient.setAwsCredentials).toHaveBeenCalledTimes(2);
    });

    it('should schedule nothing once disposed during a refresh', async () => {
      const created = sink();
      await created.init();
      let answer: (value: UwtRumBootstrap) => void = () => undefined;
      load.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));

      await jest.advanceTimersByTimeAsync(HOUR - 5 * MINUTE);
      created.dispose();
      answer(bootstrap());
      await jest.advanceTimersByTimeAsync(0);

      expect(jest.getTimerCount()).toBe(0);
      expect(mockClient.setAwsCredentials).toHaveBeenCalledTimes(1);
    });

    it('should not retry a failed refresh once disposed', async () => {
      const created = sink();
      await created.init();
      let fail: (error: Error) => void = () => undefined;
      load.mockReturnValueOnce(
        new Promise((_resolve, reject) => (fail = reject))
      );

      await jest.advanceTimersByTimeAsync(HOUR - 5 * MINUTE);
      created.dispose();
      fail(new Error('broker down'));
      await jest.advanceTimersByTimeAsync(0);

      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
