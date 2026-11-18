import * as core from './public-api';
import {
  UwtLogRecord,
  UwtNoopTelemetrySink,
  uwtCreateTelemetry
} from './public-api';

/**
 * The core must import, and run, where there is no browser: in Node, on a
 * server, in a worker. This spec runs in Jest's Node environment, with no
 * `window`, `document` or `localStorage`.
 */
describe('the core outside a browser', () => {
  it('should import without browser globals', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
    expect(Object.keys(core)).toContain('uwtCreateTelemetry');
  });

  it('should keep no session start, and not throw, without storage', () => {
    expect(() => core.uwtMarkSessionStart('s1', 1_000)).not.toThrow();
    expect(core.uwtSessionElapsed('s1', 2_000)).toBeUndefined();
  });

  it('should run scenarios, BI events and logging, and dispose, with no page', async () => {
    const sent: { eventType: string; payload: object }[] = [];
    const destination = new (class extends UwtNoopTelemetrySink {
      override record(eventType: string, payload: object): void {
        sent.push({ eventType, payload });
      }
    })();
    const records: UwtLogRecord[] = [];
    const telemetry = uwtCreateTelemetry({
      identity: { application: 'worker', environment: 'test', version: '1' },
      destination,
      logApi: {
        send: (record) => records.push(record),
        query: async () => records
      }
    });

    telemetry.scenarios.start({ name: 'import' }).step('parse').complete();
    telemetry.bi.track('file_imported', { rows: 3 });
    telemetry.logging.getLogger('import').log('Imported');

    expect(sent.map((e) => e.eventType)).toEqual([
      'com.uwt.scenario',
      'com.uwt.bi'
    ]);
    expect(await telemetry.logging.query()).toHaveLength(1);
    expect(() => telemetry.dispose()).not.toThrow();
  });
});
