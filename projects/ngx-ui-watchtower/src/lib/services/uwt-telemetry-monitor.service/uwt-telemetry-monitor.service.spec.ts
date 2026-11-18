import {
  UwtBIEvent,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ui-watchtower';
import { UwtTelemetryMonitor } from './uwt-telemetry-monitor.service';

// What it does with each event — when it copies, numbers, and stays out of
// the way of a failure — is the core monitor's, tested in the core. These
// cover what this package adds: `events$`.

function biEvent(): UwtBIEvent {
  return {
    eventName: 'export_clicked',
    eventTime: '2026-01-01T00:00:00.000Z',
    metadata: { format: 'csv' },
    application: 'test-app'
  };
}

describe('UwtTelemetryMonitor', () => {
  let monitor: UwtTelemetryMonitor;
  let received: UwtTelemetryObservedEvent[];

  beforeEach(() => {
    monitor = new UwtTelemetryMonitor();
    received = [];
  });

  afterEach(() => {
    monitor.ngOnDestroy();
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

  it('should deliver an event to a subscriber, with the envelope filled in', () => {
    monitor.events$.subscribe((e) => received.push(e));

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

  it('should hand a subscriber a copy, isolated from the object that was sent', () => {
    monitor.events$.subscribe((e) => received.push(e));
    const sent = biEvent();

    publishBI(sent);
    const observed = received[0].payload as UwtBIEvent;

    expect(observed).toEqual(sent);
    expect(observed).not.toBe(sent);

    observed.metadata!.format = 'changed-by-observer';
    sent.metadata!.format = 'changed-by-sender';
    expect(sent.metadata!.format).toBe('changed-by-sender');
    expect(observed.metadata!.format).toBe('changed-by-observer');
  });

  it('should number events in increasing order', () => {
    monitor.events$.subscribe((e) => received.push(e));

    publishBI();
    publishBI();
    publishBI();

    const [a, b, c] = received.map((e) => e.sequence);
    expect(b).toBe(a + 1);
    expect(c).toBe(b + 1);
  });

  it('should stop observing once the last subscriber leaves', () => {
    const subscription = monitor.events$.subscribe((e) => received.push(e));
    subscription.unsubscribe();

    expect(monitor.observed).toBe(false);
    expect(publishBI()).toBeUndefined();
    expect(received).toHaveLength(0);
  });

  it('should complete its subscribers and stop observing when destroyed', () => {
    let completed = false;
    monitor.events$.subscribe({
      next: (e) => received.push(e),
      complete: () => (completed = true)
    });

    monitor.ngOnDestroy();

    expect(completed).toBe(true);
    expect(monitor.observed).toBe(false);
    expect(publishBI()).toBeUndefined();
    monitor.events$.subscribe((e) => received.push(e));
    expect(publishBI()).toBeUndefined();
    expect(received).toHaveLength(0);
  });
});
