import { UwtTelemetryObservedEvent } from '@absaoss-cps/ngx-ui-watchtower';
import { uwtInspectorSectionOf } from '../uwt-inspector-filter/uwt-inspector-filter';
import { uwtInspectorRow } from './uwt-inspector-rows';

const base = {
  sequence: 7,
  capturedAt: '2026-01-01T00:00:00.000Z',
  destination: 'sink' as const,
  origin: { forwarded: false as const }
};

/** The row shown for `event`, without its entry. */
function rowOf(event: UwtTelemetryObservedEvent) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { entry, time, ...row } = uwtInspectorRow({
    event,
    section: uwtInspectorSectionOf(event.kind),
    fields: [],
    sizeChars: 0
  });
  return row;
}

describe('uwtInspectorRow', () => {
  it('should show a BI event by name, with its first metadata', () => {
    expect(
      rowOf({
        ...base,
        kind: 'bi',
        eventType: 'com.uwt.bi',
        payload: {
          eventName: 'theme_changed',
          eventTime: '',
          application: 'app',
          scenarioId: 's-1',
          metadata: { a: 1, b: 2, c: 3, d: 4 }
        }
      })
    ).toEqual({
      sequence: 7,
      kind: 'BI',
      name: 'theme_changed',
      details: 'a=1, b=2, c=3, …',
      tone: undefined,
      eventType: 'com.uwt.bi',
      id: 's-1',
      forwardedFrom: undefined
    });
  });

  it('should show a scenario with its status, duration and steps', () => {
    expect(
      rowOf({
        ...base,
        kind: 'scenario',
        eventType: 'com.uwt.scenario',
        payload: {
          scenarioId: 's-1',
          scenarioName: 'checkout',
          status: 'failure',
          startTime: '',
          delta: 42,
          elapsed: 0,
          stepCount: 1,
          steps: [],
          application: 'app'
        }
      })
    ).toMatchObject({
      kind: 'Scenario',
      name: 'checkout',
      details: 'failure · 42 ms · 1 step',
      tone: 'error',
      id: 's-1'
    });
  });

  it('should show a step under its scenario', () => {
    expect(
      rowOf({
        ...base,
        kind: 'scenario-step',
        eventType: 'com.uwt.step',
        payload: {
          scenarioId: 's-1',
          scenarioName: 'checkout',
          name: 'pay',
          status: 'abandoned',
          stepDelta: 5,
          application: 'app'
        } as never
      })
    ).toMatchObject({
      kind: 'Step',
      name: 'checkout · pay',
      details: 'abandoned · 5 ms',
      tone: 'warn'
    });
  });

  it('should show a log by logger, with its level and message', () => {
    expect(
      rowOf({
        ...base,
        kind: 'log',
        destination: 'log-provider',
        payload: {
          timestamp: '',
          level: 'warn',
          message: 'Careful now',
          logger: 'checkout',
          correlationId: 'c-9',
          application: 'app',
          environment: 'test',
          version: '1'
        }
      })
    ).toMatchObject({
      kind: 'Log',
      name: 'checkout',
      details: 'warn · Careful now',
      tone: 'warn',
      eventType: '',
      id: 'c-9'
    });
  });

  it('should show an error sent to RUM', () => {
    expect(
      rowOf({
        ...base,
        kind: 'error',
        payload: { name: 'TypeError', message: 'x is undefined' }
      })
    ).toMatchObject({
      kind: 'Error',
      name: 'TypeError',
      details: '→ RUM · x is undefined',
      tone: 'error'
    });
  });

  it('should show a forwarded event of an unknown type, and who sent it', () => {
    expect(
      rowOf({
        ...base,
        origin: { forwarded: true, application: 'fragment' },
        kind: 'unknown',
        eventType: 'com.other.thing',
        payload: {}
      })
    ).toMatchObject({
      kind: 'BI',
      name: 'com.other.thing',
      details: 'unrecognised event type',
      forwardedFrom: 'fragment'
    });
  });
});
