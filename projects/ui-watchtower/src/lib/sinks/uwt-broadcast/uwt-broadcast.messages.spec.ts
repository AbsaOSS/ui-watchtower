/**
 * @jest-environment jsdom
 */
import {
  uwtElectBroadcastHostLeader,
  uwtIsBroadcastMessage
} from './uwt-broadcast.messages';

/** Minimal Web Locks API stub: grants each named lock to one requester at a time. */
class LockManagerStub {
  private readonly held = new Set<string>();
  private readonly queues = new Map<string, (() => void)[]>();

  request(name: string, callback: () => Promise<void>): Promise<void> {
    return new Promise((resolve) => {
      const grant = () => {
        this.held.add(name);
        callback().then(() => {
          this.held.delete(name);
          resolve();
          this.queues.get(name)?.shift()?.();
        });
      };

      if (this.held.has(name)) {
        const queue = this.queues.get(name) ?? [];
        queue.push(grant);
        this.queues.set(name, queue);
      } else {
        grant();
      }
    });
  }

  /** Installs the stub as `navigator.locks`. */
  static install(): void {
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: new LockManagerStub(),
      configurable: true
    });
  }

  static uninstall(): void {
    delete (globalThis.navigator as { locks?: unknown }).locks;
  }
}

describe('the broadcast protocol', () => {
  describe('uwtElectBroadcastHostLeader', () => {
    afterEach(() => LockManagerStub.uninstall());

    it('should elect immediately when the Locks API is unavailable', () => {
      const onElected = jest.fn();
      uwtElectBroadcastHostLeader('ngx-ui-watchtower', onElected);

      expect(onElected).toHaveBeenCalledTimes(1);
    });

    it('should elect once the lock is granted', () => {
      LockManagerStub.install();
      const onElected = jest.fn();
      uwtElectBroadcastHostLeader('ngx-ui-watchtower', onElected);

      expect(onElected).toHaveBeenCalledTimes(1);
    });

    it('should fail open and still elect when request() itself rejects', async () => {
      Object.defineProperty(globalThis.navigator, 'locks', {
        value: { request: () => Promise.reject(new Error('not-fully-active')) },
        configurable: true
      });
      const onElected = jest.fn();

      uwtElectBroadcastHostLeader('ngx-ui-watchtower', onElected);
      // Let the rejection's microtask settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(onElected).toHaveBeenCalledTimes(1);
    });

    it('should fail open and still elect when request() itself throws synchronously', () => {
      Object.defineProperty(globalThis.navigator, 'locks', {
        value: {
          request: () => {
            throw new Error('locks unavailable in this context');
          }
        },
        configurable: true
      });
      const onElected = jest.fn();

      expect(() =>
        uwtElectBroadcastHostLeader('ngx-ui-watchtower', onElected)
      ).not.toThrow();
      expect(onElected).toHaveBeenCalledTimes(1);
    });

    it('should not elect a requester released while still queued, and should let the next requester through', async () => {
      LockManagerStub.install();
      const onElectedHolder = jest.fn();
      const onElectedA = jest.fn();
      const onElectedB = jest.fn();

      const releaseHolder = uwtElectBroadcastHostLeader(
        'ngx-ui-watchtower',
        onElectedHolder
      );
      const releaseA = uwtElectBroadcastHostLeader(
        'ngx-ui-watchtower',
        onElectedA
      );
      uwtElectBroadcastHostLeader('ngx-ui-watchtower', onElectedB);

      // A is released before ever being granted the lock.
      releaseA();
      // The current holder releases, so the lock passes down the queue.
      releaseHolder();
      for (let i = 0; i < 6; i++) {
        await Promise.resolve();
      }

      expect(onElectedA).not.toHaveBeenCalled();
      expect(onElectedB).toHaveBeenCalledTimes(1);
    });
  });

  describe('uwtIsBroadcastMessage', () => {
    it.each([null, undefined, 'string', 42, ['array']])(
      'should reject the non-object payload %p',
      (data) => {
        expect(uwtIsBroadcastMessage(data)).toBe(false);
      }
    );

    it('should reject a payload with an unknown kind', () => {
      expect(uwtIsBroadcastMessage({ kind: 'other library' })).toBe(false);
    });

    it('should accept a well-formed event message', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'event',
          eventType: 'com.uwt.bi',
          payload: { eventName: 'x' }
        })
      ).toBe(true);
    });

    it.each([
      { eventType: 'com.uwt.bi' },
      { payload: {} },
      { eventType: 1, payload: {} },
      { eventType: 'com.uwt.bi', payload: 'not-an-object' },
      {
        eventType: 'com.uwt.bi',
        payload: {},
        metadata: { nested: {} }
      },
      {
        eventType: 'com.uwt.bi',
        payload: {},
        metadata: { list: [1, 2] }
      },
      {
        eventType: 'com.uwt.bi',
        payload: {},
        metadata: 'not-an-object'
      }
    ])('should reject a malformed event message %p', (fields) => {
      expect(uwtIsBroadcastMessage({ kind: 'event', ...fields })).toBe(false);
    });

    it('should accept an event message with flat-primitive metadata', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'event',
          eventType: 'com.uwt.bi',
          payload: {},
          metadata: { count: 3, ok: true, note: 'x', blank: null }
        })
      ).toBe(true);
    });

    it('should accept an event message with no metadata', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'event',
          eventType: 'com.uwt.bi',
          payload: {}
        })
      ).toBe(true);
    });

    it('should accept a well-formed error message', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'error',
          error: { name: 'Error', message: 'boom' }
        })
      ).toBe(true);
    });

    it.each([
      {},
      { error: { name: 'Error' } },
      { error: { message: 'boom' } },
      { error: 'boom' },
      { error: { name: 'Error', message: 'boom', stack: 42 } },
      {
        error: { name: 'Error', message: 'boom' },
        metadata: { nested: {} }
      }
    ])('should reject a malformed error message %p', (fields) => {
      expect(uwtIsBroadcastMessage({ kind: 'error', ...fields })).toBe(false);
    });

    it('should accept an error message with flat-primitive metadata', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'error',
          error: { name: 'Error', message: 'boom' },
          metadata: { origin: 'checkout' }
        })
      ).toBe(true);
    });

    it('should accept an error message with a string stack', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'error',
          error: { name: 'Error', message: 'boom', stack: 'at foo.ts:1' }
        })
      ).toBe(true);
    });

    it('should accept a well-formed flush message', () => {
      expect(uwtIsBroadcastMessage({ kind: 'flush', beacon: true })).toBe(true);
    });

    it('should reject a flush message with a non-boolean beacon', () => {
      expect(uwtIsBroadcastMessage({ kind: 'flush', beacon: 'true' })).toBe(
        false
      );
    });

    it.each([{ userId: 'u-1' }, { userId: undefined }, {}])(
      'should accept a well-formed user message %p',
      (fields) => {
        expect(uwtIsBroadcastMessage({ kind: 'user', ...fields })).toBe(true);
      }
    );

    it('should reject a user message with a non-string, non-undefined userId', () => {
      expect(uwtIsBroadcastMessage({ kind: 'user', userId: 42 })).toBe(false);
    });

    const logRecord = {
      timestamp: '2026-01-01T00:00:00.000Z',
      level: 'warn',
      message: 'Careful',
      application: 'cart',
      environment: 'test',
      version: '1.0.0'
    };

    it('should accept a well-formed log message', () => {
      expect(uwtIsBroadcastMessage({ kind: 'log', record: logRecord })).toBe(
        true
      );
      expect(
        uwtIsBroadcastMessage({
          kind: 'log',
          record: {
            ...logRecord,
            logger: 'checkout',
            context: 'Cart',
            correlationId: 'c-1',
            sessionId: 's',
            userId: 'u',
            metadata: { count: 1 },
            error: { name: 'Error', message: 'boom' }
          }
        })
      ).toBe(true);
    });

    it.each([
      { level: 'debug' },
      { level: 'toString' },
      { application: undefined },
      { message: 42 },
      { logger: 7 },
      { metadata: { nested: {} } },
      { error: { name: 'Error' } }
    ])('should reject a log message whose record has %p', (fields) => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'log',
          record: { ...logRecord, ...fields }
        })
      ).toBe(false);
    });

    it('should accept log-flush, log-query and log-query-result messages', () => {
      expect(uwtIsBroadcastMessage({ kind: 'log-flush' })).toBe(true);
      expect(
        uwtIsBroadcastMessage({
          kind: 'log-query',
          id: 'q-1',
          filter: { correlationId: 'c-1', minLevel: 'warn', limit: 5 }
        })
      ).toBe(true);
      expect(
        uwtIsBroadcastMessage({
          kind: 'log-query-result',
          id: 'q-1',
          records: []
        })
      ).toBe(true);
    });

    it.each([
      { id: '', filter: {} },
      { id: 'q-1', filter: null },
      { id: 'q-1', filter: { limit: 'ten' } },
      { id: 'q-1', filter: { minLevel: 'verbose' } }
    ])('should reject a malformed log-query message %p', (fields) => {
      expect(uwtIsBroadcastMessage({ kind: 'log-query', ...fields })).toBe(
        false
      );
    });

    it('should reject a log-query-result without a records array', () => {
      expect(
        uwtIsBroadcastMessage({
          kind: 'log-query-result',
          id: 'q-1',
          records: 'none'
        })
      ).toBe(false);
    });

    it('should accept an identity-request message with no other fields', () => {
      expect(uwtIsBroadcastMessage({ kind: 'identity-request' })).toBe(true);
    });

    it.each([
      {},
      { sessionId: 's-1' },
      { userId: 'u-1' },
      {
        sessionId: 's-1',
        userId: 'u-1'
      }
    ])('should accept an identity message %p', (fields) => {
      expect(uwtIsBroadcastMessage({ kind: 'identity', ...fields })).toBe(true);
    });

    it.each([{ sessionId: 42 }, { userId: 42 }, { sessionId: 42, userId: 42 }])(
      'should reject an identity message with a non-string, non-undefined field %p',
      (fields) => {
        expect(uwtIsBroadcastMessage({ kind: 'identity', ...fields })).toBe(
          false
        );
      }
    );
  });
});
