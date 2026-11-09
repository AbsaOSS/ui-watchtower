/**
 * A framework-free Node application using the installed core: no Angular,
 * RxJS or aws-rum-web is installed beside it, and there is no browser.
 */
import assert from 'node:assert/strict';
import {
  UWT_TELEMETRY_EVENT_TYPE,
  uwtCreateTelemetry,
  UwtTelemetrySink
} from '@absaoss-cps/ui-watchtower';

assert.equal(typeof globalThis.window, 'undefined');
assert.equal(typeof globalThis.document, 'undefined');

/** The application's own destination. */
class Recording extends UwtTelemetrySink {
  events = [];

  record(eventType, payload) {
    this.events.push({ eventType, payload });
  }

  recordError() {}

  getSessionId() {
    return 'session-1';
  }

  setUserId() {}

  getUserId() {
    return undefined;
  }

  flush() {}
}

const destination = new Recording();
const records = [];
const telemetry = uwtCreateTelemetry({
  identity: { application: 'worker', environment: 'test', version: '1.0.0' },
  destination,
  logApi: {
    send: (record) => records.push(record),
    query: async () => records
  }
});

const scenario = telemetry.scenarios.start({
  name: 'import',
  metadata: { token: 'secret' }
});
scenario.step('parse');
scenario.complete();
telemetry.bi.track('file_imported', { rows: 3 });
telemetry.logging.getLogger('import').warn('Slow import');

assert.deepEqual(
  destination.events.map((event) => event.eventType),
  [UWT_TELEMETRY_EVENT_TYPE.scenario, UWT_TELEMETRY_EVENT_TYPE.bi]
);
assert.equal(destination.events[0].payload.status, 'success');
assert.equal(destination.events[0].payload.metadata.token, '[redacted]');
assert.equal((await telemetry.logging.query()).length, 1);
telemetry.dispose();

// The RUM entry point loads aws-rum-web only once a sink starts, which
// without a page it never does: it is not installed here.
const { UwtRumTelemetrySink } = await import('@absaoss-cps/ui-watchtower/rum');
const rum = new UwtRumTelemetrySink({
  identity: { application: 'worker', environment: 'test', version: '1.0.0' },
  credentialsProvider: {
    load: async () => assert.fail('a sink without a page never starts')
  }
});
await rum.init();
rum.dispose();

console.log('core-only Node consumer: ok');
