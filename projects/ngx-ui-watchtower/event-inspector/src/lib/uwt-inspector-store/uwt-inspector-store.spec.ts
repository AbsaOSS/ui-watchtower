import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  UwtTelemetryMonitor,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import { UWT_EVENT_INSPECTOR_CONFIG } from '../uwt-inspector.models/uwt-inspector.models';
import { UwtInspectorRing } from '../uwt-inspector-ring/uwt-inspector-ring';
import {
  UWT_INSPECTOR_FLUSH_MS,
  UwtInspectorStore
} from './uwt-inspector-store';

const bi = (name: string): UwtTelemetryPublishInput => ({
  kind: 'bi',
  eventType: 'com.uwt.bi',
  payload: {
    eventName: name,
    eventTime: '2026-01-01T00:00:00.000Z',
    application: 'app'
  },
  destination: 'sink',
  origin: { forwarded: false }
});

const log = (message: string): UwtTelemetryPublishInput => ({
  kind: 'log',
  payload: {
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'warn',
    message,
    logger: 'checkout',
    application: 'app',
    environment: 'test',
    version: '1'
  },
  destination: 'log-provider',
  origin: { forwarded: false }
});

describe('UwtInspectorStore', () => {
  let monitor: UwtTelemetryMonitor;
  let injector: Injector;

  function createStore(max = 500): UwtInspectorStore {
    injector = Injector.create({
      providers: [
        UwtInspectorStore,
        {
          provide: UWT_EVENT_INSPECTOR_CONFIG,
          useValue: { maxEventsPerSection: max }
        }
      ],
      parent: TestBed.inject(Injector)
    });
    return injector.get(UwtInspectorStore);
  }

  const flush = () => jest.advanceTimersByTime(UWT_INSPECTOR_FLUSH_MS);
  const names = (store: UwtInspectorStore) =>
    store
      .entries()
      .bi.map((e) => (e.event.payload as { eventName: string }).eventName);

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.resetTestingModule();
    monitor = TestBed.inject(UwtTelemetryMonitor);
  });

  function destroy(): void {
    const target = injector as unknown as {
      destroy(): void;
      destroyed: boolean;
    };
    if (target && !target.destroyed) {
      target.destroy();
    }
  }

  afterEach(() => {
    destroy();
    jest.useRealTimers();
  });

  it('should start empty, and ignore everything sent before it existed', () => {
    monitor.publish(bi('before')); // nobody observing yet
    const store = createStore();
    flush();

    expect(store.total()).toBe(0);
  });

  it('should start with what the ring kept from before: at once, not as new, nor as received', () => {
    jest.setSystemTime(new Date('2026-01-01T09:00:00.000Z'));
    const ring = TestBed.inject(UwtInspectorRing);
    ring.start(2);
    ['a', 'b', 'c'].forEach((n) => monitor.publish(bi(n)));
    jest.setSystemTime(new Date('2026-01-01T09:05:00.000Z'));

    const store = createStore();

    expect(names(store)).toEqual(['c', 'b']);
    expect(store.fresh().size).toBe(0);
    expect(store.received().bi).toBe(0);
    expect(store.startedAt()).toBe('2026-01-01T09:00:00.000Z');
    expect(store.count('bi')).toEqual({ captured: 2, droppedOldest: 1 });

    // Clearing empties the ring too, so reopening won't bring them back.
    store.clear();
    expect(ring.snapshot().events).toHaveLength(0);
  });

  it('should batch arrivals into one update per flush', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    monitor.publish(bi('b'));

    expect(store.total()).toBe(0); // not on screen yet
    flush();
    expect(names(store)).toEqual(['b', 'a']); // newest first
  });

  it('should keep each kind apart', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    monitor.publish(log('careful'));
    flush();

    expect(store.entries().bi).toHaveLength(1);
    expect(store.entries().logging).toHaveLength(1);
    expect(store.entries().scenario).toHaveLength(0);
  });

  it('should keep at most the configured number per kind, counting drops', () => {
    const store = createStore(2);
    ['a', 'b', 'c', 'd'].forEach((n) => monitor.publish(bi(n)));
    ['x', 'y', 'z'].forEach((m) => monitor.publish(log(m)));
    flush();

    expect(names(store)).toEqual(['d', 'c']);
    expect(store.dropped().bi).toBe(2);
    // A noisy kind never evicts another: each keeps its own two.
    expect(store.entries().logging).toHaveLength(2);
    expect(store.count('logging')).toEqual({ captured: 2, droppedOldest: 1 });
    expect(store.count('all')).toEqual({ captured: 4, droppedOldest: 3 });
  });

  it('should clear everything and keep capturing', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    flush();

    store.clear();
    expect(store.total()).toBe(0);

    monitor.publish(bi('after'));
    flush();
    expect(names(store)).toEqual(['after']);
  });

  it('should freeze the view while paused, but keep capturing', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    flush();

    store.setPaused(true);
    monitor.publish(bi('b'));
    monitor.publish(bi('c'));
    flush();
    expect(names(store)).toEqual(['a']);
    expect(store.newWhilePaused()).toBe(2);
    // The export still contains them.
    expect(store.events('bi')).toHaveLength(3);

    store.setPaused(false);
    expect(names(store)).toEqual(['c', 'b', 'a']);
    expect(store.newWhilePaused()).toBe(0);
  });

  it('should remember when it was paused, through a clear, until resumed', () => {
    const store = createStore();
    expect(store.pausedAt()).toBeUndefined();

    store.setPaused(true);
    const at = store.pausedAt();
    expect(at).toBeDefined();
    store.setPaused(true);
    store.clear();
    expect(store.pausedAt()).toBe(at);

    store.setPaused(false);
    expect(store.pausedAt()).toBeUndefined();
  });

  it('should include not-yet-flushed events in the download without hiding them', () => {
    const store = createStore();
    monitor.publish(bi('a'));

    expect(store.events('bi')).toHaveLength(1);
    expect(store.events('all')).toHaveLength(1);
    expect(store.count('bi')).toEqual({ captured: 1, droppedOldest: 0 });

    flush();
    expect(names(store)).toEqual(['a']);
  });

  it('should export one kind, or every kind, oldest first', () => {
    const store = createStore();
    monitor.publish(bi('first'));
    monitor.publish(log('a log line'));
    monitor.publish(bi('second'));
    flush();

    const events = store.events('bi');
    expect(events.map((e) => e.kind)).toEqual(['bi', 'bi']);
    expect(events[0].sequence).toBeLessThan(events[1].sequence);
    expect(store.events('all').map((e) => e.kind)).toEqual(['bi', 'log', 'bi']);
    expect(store.events('logging')).toHaveLength(1);
    expect(store.events('scenario')).toHaveLength(0);
  });

  it('should show every kind merged newest first, or one kind', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    monitor.publish(log('b'));
    monitor.publish(bi('c'));
    flush();

    const sequences = store.filtered().map((e) => e.event.sequence);
    expect(store.filtered().map((e) => e.event.kind)).toEqual([
      'bi',
      'log',
      'bi'
    ]);
    expect(sequences).toEqual([...sequences].sort((x, y) => y - x));

    store.setKind('logging');
    expect(store.filtered().map((e) => e.event.kind)).toEqual(['log']);
  });

  it('should filter every kind at once, ignoring case, and count matches per kind', () => {
    const store = createStore();
    monitor.publish(bi('theme_changed'));
    monitor.publish(bi('sidebar_toggled'));
    monitor.publish(log('Careful now'));
    flush();

    store.setText('THEME');
    expect(store.filtered()).toHaveLength(1);
    expect(store.matchCounts()).toEqual({ bi: 1, scenario: 0, logging: 0 });

    store.setText('');
    store.addFilter({ path: 'level', operator: 'equals', value: 'warn' });
    expect(store.filtered().map((e) => e.event.kind)).toEqual(['log']);
    expect(store.matchCounts()).toEqual({ bi: 0, scenario: 0, logging: 1 });

    store.removeFilter(store.filters().fields[0].id);
    expect(store.filtered()).toHaveLength(3);

    store.setText('careful');
    store.setKind('bi');
    expect(store.filtered()).toHaveLength(0);
    store.clearFilters();
    expect(store.filters()).toEqual({ text: '', fields: [] });
    expect(store.filtered()).toHaveLength(2);
  });

  it('should suggest filter fields from the kind shown', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    monitor.publish(log('b'));
    flush();

    expect(store.knownPaths()).toContain('level');
    expect(store.knownPaths()).toContain('eventName');

    store.setKind('bi');
    expect(store.knownPaths()).not.toContain('level');
    expect(store.knownPaths()).toContain('eventName');
  });

  it('should mark the latest arrivals as new, briefly', () => {
    const store = createStore();
    monitor.publish(bi('a'));
    flush();

    const [entry] = store.entries().bi;
    expect(store.fresh().has(entry.event.sequence)).toBe(true);
    jest.advanceTimersByTime(3000);
    expect(store.fresh().size).toBe(0);
  });

  it('should keep going after an event it cannot prepare', () => {
    const store = createStore();
    const payload: Record<string, unknown> = { eventName: 'x' };
    Object.defineProperty(payload, 'boom', {
      enumerable: true,
      get: () => {
        throw new Error('bad getter');
      }
    });
    // Delivered as-is, bypassing the monitor's copy, to simulate a bad payload.
    (store as unknown as { receive(e: unknown): void }).receive({
      ...bi('x'),
      payload,
      sequence: 99,
      capturedAt: ''
    });
    monitor.publish(bi('fine'));
    flush();

    expect(store.entries().bi).toHaveLength(2);
    expect(store.entries().bi[1].renderError).toBe('bad getter');
  });

  it('should stop observing when destroyed', () => {
    createStore();
    expect(monitor.observed).toBe(true);

    destroy();
    expect(monitor.observed).toBe(false);
  });
});
