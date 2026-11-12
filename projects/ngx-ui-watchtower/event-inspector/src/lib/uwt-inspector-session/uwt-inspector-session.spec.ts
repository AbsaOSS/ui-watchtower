import { TestBed } from '@angular/core/testing';
import { UwtTelemetryMonitor } from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorSession } from './uwt-inspector-session';

describe('UwtInspectorSession', () => {
  it('should start capturing on first use, and keep one history', () => {
    const session = TestBed.inject(UwtInspectorSession);
    const monitor = TestBed.inject(UwtTelemetryMonitor);
    expect(monitor.observed).toBe(false);

    const store = session.store;

    expect(monitor.observed).toBe(true);
    expect(session.store).toBe(store);
    session.end();
  });

  it('should discard the history and stop capturing when it ends', () => {
    const session = TestBed.inject(UwtInspectorSession);
    const first = session.store;

    session.end();

    expect(TestBed.inject(UwtTelemetryMonitor).observed).toBe(false);
    expect(session.store).not.toBe(first);
    session.end();
  });
});
