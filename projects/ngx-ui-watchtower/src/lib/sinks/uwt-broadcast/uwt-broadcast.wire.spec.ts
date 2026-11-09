import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, PLATFORM_ID } from '@angular/core';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  UWT_DEFAULT_TELEMETRY_CONFIG,
  UWT_REDACT_CONFIG,
  UWT_TELEMETRY_IDENTITY
} from '../../config/uwt-telemetry-common.config/uwt-telemetry-common.config';
import { UWT_BI_TELEMETRY_CONFIG } from '../../config/uwt-bi-telemetry.config/uwt-bi-telemetry.config';
import { UWT_LOG_CONFIG } from '../../config/uwt-log.config/uwt-log.config';
import { UWT_SCENARIO_TELEMETRY_CONFIG } from '../../config/uwt-scenario-telemetry.config/uwt-scenario-telemetry.config';
import {
  UwtTelemetryError,
  UwtTelemetryMetadata
} from '../../models/uwt-telemetry-common.models/uwt-telemetry-common.models';
import { UwtLogRecord } from '../../models/uwt-log.models/uwt-log.models';
import {
  UWT_LOG_API_PROVIDER,
  UwtLogApiProvider,
  UwtLogQuery
} from '../../providers/uwt-log-api.provider/uwt-log-api.provider';
import { UwtBroadcastLogApiProvider } from '../../providers/uwt-broadcast-log-api.provider/uwt-broadcast-log-api.provider';
import { UwtBITelemetryService } from '../../services/uwt-bi-telemetry.service/uwt-bi-telemetry.service';
import { UwtLoggerService } from '../../services/uwt-logger.service/uwt-logger.service';
import { UwtScenarioTelemetryService } from '../../services/uwt-scenario-telemetry.service/uwt-scenario-telemetry.service';
import { UwtTelemetrySink } from '../uwt-telemetry/uwt-telemetry-abstract.sink/uwt-telemetry-abstract.sink';
import { UwtTelemetryBroadcastHost } from './uwt-broadcast-host.service';
import { UwtBroadcastTelemetrySink } from './uwt-broadcast-telemetry.sink';

/**
 * The broadcast protocol is a contract between realms deployed separately:
 * a shell and its fragments may run different versions. This records every
 * message a shell and a fragment exchange through one full session, and
 * checks it against the fixture recorded from the implementation before the
 * core was extracted. Record it again only deliberately, with
 * `UPDATE_WIRE_FIXTURE=1`.
 */
const FIXTURE = join(__dirname, 'uwt-broadcast.wire.fixture.json');

/** A message as posted: by which realm, and what it carried. */
interface Posted {
  from: string;
  message: unknown;
}

/**
 * `BroadcastChannel` for the test, delivering asynchronously to every other
 * instance of the same name, and keeping each message as posted.
 */
class WireChannel {
  /** The realm the next channel belongs to. */
  static realm = '';
  static readonly posted: Posted[] = [];
  private static readonly channels = new Map<string, WireChannel[]>();

  onmessage: ((event: { data: unknown }) => void) | null = null;
  private readonly realm = WireChannel.realm;
  private closed = false;

  constructor(readonly name: string) {
    WireChannel.channels.set(name, [
      ...(WireChannel.channels.get(name) ?? []),
      this
    ]);
  }

  static reset(): void {
    WireChannel.posted.length = 0;
    WireChannel.channels.clear();
  }

  postMessage(message: unknown): void {
    if (this.closed) {
      return;
    }
    WireChannel.posted.push({ from: this.realm, message: plain(message) });
    for (const peer of WireChannel.channels.get(this.name) ?? []) {
      if (peer !== this) {
        const data = JSON.parse(JSON.stringify(message));
        setTimeout(() => !peer.closed && peer.onmessage?.({ data }), 0);
      }
    }
  }

  close(): void {
    this.closed = true;
    WireChannel.channels.set(
      this.name,
      (WireChannel.channels.get(this.name) ?? []).filter((c) => c !== this)
    );
  }
}

/**
 * A message as structured clone carries it: keys in a stable order, and a
 * key whose value is `undefined` kept, as clone keeps it and JSON doesn't.
 */
function plain(value: unknown): unknown {
  if (value === undefined) {
    return '<undefined>';
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, plain((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/**
 * Fields whose value is a time, an offset or a duration — `eventTime`,
 * `endOffset`, `stepDelta`, `sessionElapsed`… — which differ run to run.
 */
const TIMED = /(^|[a-z])(time|offset|delta|elapsed|duration|timestamp)$/i;

/**
 * What can differ between runs made comparable: ids numbered by first
 * appearance, and times and durations by their type.
 */
function stable(posted: Posted[]): Posted[] {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Map<string, string>();
  const walk = (value: unknown, key = ''): unknown => {
    if (TIMED.test(key) && value !== '<undefined>') {
      return `<${typeof value}>`;
    }
    if (typeof value === 'string' && uuid.test(value)) {
      if (!ids.has(value)) {
        ids.set(value, `<id ${ids.size + 1}>`);
      }
      return ids.get(value);
    }
    if (Array.isArray(value)) {
      return value.map((v) => walk(v));
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, walk(v, k)])
      );
    }
    return value;
  };
  return walk(posted) as Posted[];
}

/** The shell's real destination, with a session and user it controls. */
@Injectable()
class ShellSink extends UwtTelemetrySink {
  sessionId: string | undefined = 'shell-session';
  userId?: string;

  record(_eventType: string, _payload: object, _meta?: UwtTelemetryMetadata) {
    // Recorded on the wire, not here.
  }

  recordError(_error: UwtTelemetryError, _meta?: UwtTelemetryMetadata) {
    // Recorded on the wire, not here.
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  setUserId(userId: string | undefined): void {
    this.userId = userId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }

  flush(): void {
    // Nothing buffered.
  }
}

/** The shell's log backend, answering queries with what it has. */
@Injectable()
class ShellLogApi implements UwtLogApiProvider {
  readonly records: UwtLogRecord[] = [];

  send(record: UwtLogRecord): void {
    this.records.push(record);
  }

  query(filter: UwtLogQuery): Promise<UwtLogRecord[]> {
    return Promise.resolve(
      this.records
        .filter((r) => !filter.logger || r.logger === filter.logger)
        .slice(0, filter.limit)
    );
  }

  flush(): void {
    // Nothing buffered.
  }
}

/** A realm: its own injector, as the shell and each fragment have. */
function createRealm(providers: unknown[]): Injector {
  return Injector.create({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: DOCUMENT, useValue: document },
      {
        provide: UWT_TELEMETRY_IDENTITY,
        useValue: {
          application: 'realm',
          environment: 'test',
          version: '1.0.0',
          eventNamespace: 'com.uwt'
        }
      },
      {
        provide: UWT_SCENARIO_TELEMETRY_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.scenario
      },
      { provide: UWT_LOG_CONFIG, useValue: UWT_DEFAULT_TELEMETRY_CONFIG.logs },
      {
        provide: UWT_BI_TELEMETRY_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.bi
      },
      {
        provide: UWT_REDACT_CONFIG,
        useValue: UWT_DEFAULT_TELEMETRY_CONFIG.redact
      },
      UwtLoggerService,
      UwtScenarioTelemetryService,
      UwtBITelemetryService,
      ...(providers as never[])
    ]
  });
}

describe('the broadcast wire protocol', () => {
  beforeEach(() => {
    localStorage.clear();
    WireChannel.reset();
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: WireChannel,
      configurable: true,
      writable: true
    });
  });

  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  /** Lets every delivery, and every reply it causes, arrive. */
  async function settle(): Promise<void> {
    for (let turn = 0; turn < 6; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it('should carry what a shell and a fragment exchange, unchanged', async () => {
    WireChannel.realm = 'shell';
    const shell = createRealm([
      ShellSink,
      { provide: UwtTelemetrySink, useExisting: ShellSink },
      ShellLogApi,
      { provide: UWT_LOG_API_PROVIDER, useExisting: ShellLogApi },
      UwtTelemetryBroadcastHost
    ]);
    const shellSink = shell.get(ShellSink);
    const host = shell.get(UwtTelemetryBroadcastHost);

    WireChannel.realm = 'fragment';
    const fragment = createRealm([
      UwtBroadcastTelemetrySink,
      { provide: UwtTelemetrySink, useExisting: UwtBroadcastTelemetrySink },
      UwtBroadcastLogApiProvider,
      { provide: UWT_LOG_API_PROVIDER, useExisting: UwtBroadcastLogApiProvider }
    ]);
    const sink = fragment.get(UwtTelemetrySink);
    const logApi = fragment.get(UWT_LOG_API_PROVIDER);
    await settle();

    // A scenario with a step, a business event, logs and a mirrored error.
    const scenario = fragment
      .get(UwtScenarioTelemetryService)
      .start({ name: 'checkout', metadata: { cart: 'c-1' } });
    scenario.step('pay', { method: 'card' });
    scenario.endStep();
    scenario.complete({ metadata: { items: 2 } });
    fragment
      .get(UwtBITelemetryService)
      .track('export_clicked', { format: 'csv' });
    const logger = fragment.get(UwtLoggerService).getLogger('checkout');
    logger.warn('Slow payment', { metadata: { ms: 900 } });
    logger.error('Payment failed', { error: new Error('Declined') });
    await settle();

    // A sign-in, flushes, and a query answered by the shell's backend.
    sink.setUserId('user-1');
    await settle();
    sink.flush(true);
    logApi.flush?.();
    const found = logApi.query({ logger: 'checkout', limit: 1 });
    await settle();
    expect(await found).toHaveLength(1);

    // The shell's session moves on: the next record is stamped with it.
    shellSink.sessionId = 'shell-session-2';
    fragment.get(UwtBITelemetryService).track('theme_changed');
    await settle();

    host.ngOnDestroy();
    const recorded = stable(WireChannel.posted);
    if (process.env.UPDATE_WIRE_FIXTURE === '1') {
      writeFileSync(FIXTURE, JSON.stringify(recorded, null, 2) + '\n');
    }
    expect(existsSync(FIXTURE)).toBe(true);
    expect(recorded).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
