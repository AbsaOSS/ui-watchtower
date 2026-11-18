import { UwtBIEvent } from '../../models/uwt-bi.models/uwt-bi.models';
import { UwtTelemetryObservedEvent } from '../../models/uwt-telemetry-monitor.models/uwt-telemetry-monitor.models';
import * as safeUtil from '../../utils/uwt-telemetry-safe.util/uwt-telemetry-safe.util';
import { UwtTelemetryMonitor } from './uwt-telemetry-monitor';

function biEvent(): UwtBIEvent {
  return {
    eventName: 'export_clicked',
    eventTime: '2026-01-01T00:00:00.000Z',
    metadata: { format: 'csv' },
    application: 'test-app'
  };
}

describe('UwtTelemetryMonitor (core)', () => {
  let monitor: UwtTelemetryMonitor;
  let received: UwtTelemetryObservedEvent[];

  beforeEach(() => {
    monitor = new UwtTelemetryMonitor();
    received = [];
  });

  afterEach(() => {
    monitor.dispose();
    jest.restoreAllMocks();
  });

  function publishBI(payload = biEvent()): number | undefined {
    return monitor.publish({
      kind: 'bi',
      eventType: 'com.uwt.bi',
      payload,
      destination: 'sink',
      origin: { forwarded: false }
    });
  }

  it('should do nothing, and copy nothing, while nobody is listening', () => {
    const clone = jest.spyOn(safeUtil, 'uwtDeepClone');

    expect(monitor.observed).toBe(false);
    expect(publishBI()).toBeUndefined();
    expect(clone).not.toHaveBeenCalled();
  });

  it('should deliver an event to a listener, with the envelope filled in', () => {
    monitor.subscribe((e) => received.push(e));

    const sequence = publishBI();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      kind: 'bi',
      eventType: 'com.uwt.bi',
      destination: 'sink',
      origin: { forwarded: false },
      sequence
    });
    expect(received[0].capturedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  it('should hand a listener a copy, isolated from the object that was sent', () => {
    monitor.subscribe((e) => received.push(e));
    const sent = biEvent();

    publishBI(sent);
    const observed = received[0].payload as UwtBIEvent;

    expect(observed).toEqual(sent);
    expect(observed).not.toBe(sent);
    observed.metadata!.format = 'changed-by-observer';
    expect(sent.metadata!.format).toBe('csv');
  });

  it('should number events in increasing order', () => {
    monitor.subscribe((e) => received.push(e));

    publishBI();
    publishBI();
    publishBI();

    const [a, b, c] = received.map((e) => e.sequence);
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it('should stop observing once the last listener leaves', () => {
    const stop = monitor.subscribe((e) => received.push(e));
    stop();

    expect(monitor.observed).toBe(false);
    expect(publishBI()).toBeUndefined();
    expect(received).toHaveLength(0);
  });

  it('should still reach the other listeners when one throws', () => {
    const report = jest.fn();
    monitor = new UwtTelemetryMonitor({ report });
    monitor.subscribe(() => {
      throw new Error('listener failed');
    });
    monitor.subscribe((e) => received.push(e));

    expect(() => publishBI()).not.toThrow();
    expect(received).toHaveLength(1);
    expect(report).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('monitor.listener'),
      expect.any(Error)
    );
  });

  it('should never throw into the hand-off site, even when copying fails', () => {
    monitor.subscribe((e) => received.push(e));
    jest.spyOn(safeUtil, 'uwtDeepClone').mockImplementation(() => {
      throw new Error('clone failed');
    });

    expect(() => publishBI()).not.toThrow();
    expect(received).toHaveLength(0);
  });

  it('should stop every listener when disposed', () => {
    monitor.subscribe((e) => received.push(e));

    monitor.dispose();

    expect(monitor.observed).toBe(false);
    expect(publishBI()).toBeUndefined();
    expect(received).toHaveLength(0);
  });
});
