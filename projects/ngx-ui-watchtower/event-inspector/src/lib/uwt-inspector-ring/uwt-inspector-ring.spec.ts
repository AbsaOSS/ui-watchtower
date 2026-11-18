import { TestBed } from '@angular/core/testing';
import {
  UwtTelemetryMonitor,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorRing } from './uwt-inspector-ring';

const bi = (name: string): UwtTelemetryPublishInput => ({
  kind: 'bi',
  eventType: 'com.uwt.bi',
  payload: { eventName: name, eventTime: '', application: 'app' },
  destination: 'sink',
  origin: { forwarded: false }
});

const log = (message: string): UwtTelemetryPublishInput => ({
  kind: 'log',
  payload: {
    timestamp: '',
    level: 'log',
    message,
    application: 'app',
    environment: 'test',
    version: '1'
  },
  destination: 'log-provider',
  origin: { forwarded: false }
});

describe('UwtInspectorRing', () => {
  let monitor: UwtTelemetryMonitor;
  let ring: UwtInspectorRing;

  const names = () =>
    ring
      .snapshot()
      .events.map((e) =>
        e.kind === 'bi'
          ? (e.payload as { eventName: string }).eventName
          : (e.payload as { message: string }).message
      );

  beforeEach(() => {
    TestBed.resetTestingModule();
    monitor = TestBed.inject(UwtTelemetryMonitor);
    ring = TestBed.inject(UwtInspectorRing);
  });

  it('should observe nothing until started, nor when asked for none', () => {
    expect(monitor.observed).toBe(false);
    ring.start(0);
    expect(monitor.observed).toBe(false);

    ring.start(5);
    expect(monitor.observed).toBe(true);
  });

  it('should keep the latest of each kind, oldest first, counting drops', () => {
    ring.start(2);
    ['a', 'b', 'c'].forEach((n) => monitor.publish(bi(n)));
    monitor.publish(log('kept'));

    expect(names()).toEqual(['b', 'c', 'kept']);
    expect(ring.snapshot().dropped).toEqual({ bi: 1, scenario: 0, logging: 0 });
  });

  it('should start once, keeping its first limit', () => {
    ring.start(1);
    ring.start(5);
    ['a', 'b'].forEach((n) => monitor.publish(bi(n)));

    expect(names()).toEqual(['b']);
  });

  it('should say when it began, and begin again when cleared', () => {
    expect(ring.snapshot().startedAt).toBeUndefined();
    jest.useFakeTimers({ now: new Date('2026-01-01T09:00:00.000Z') });
    ring.start(5);
    expect(ring.snapshot().startedAt).toBe('2026-01-01T09:00:00.000Z');

    monitor.publish(bi('a'));
    jest.setSystemTime(new Date('2026-01-01T09:30:00.000Z'));
    ring.clear();
    jest.useRealTimers();

    expect(ring.snapshot()).toEqual({
      events: [],
      dropped: { bi: 0, scenario: 0, logging: 0 },
      startedAt: '2026-01-01T09:30:00.000Z'
    });
    // Still running.
    monitor.publish(bi('b'));
    expect(names()).toEqual(['b']);
  });

  it('should stop observing when the app is destroyed', () => {
    ring.start(5);
    TestBed.resetTestingModule();
    expect(monitor.observed).toBe(false);
  });
});
