import {
  UwtTelemetryEventKind,
  UwtTelemetryObservedEvent
} from '@absaoss-cps/ngx-ui-watchtower';
import { UwtInspectorEntry } from '../uwt-inspector.models/uwt-inspector.models';
import { uwtFieldName } from '../uwt-inspector-filter/uwt-inspector-filter';

/** How a row's details are coloured. The words always say it too. */
export type UwtInspectorTone = 'success' | 'warn' | 'error';

/** A field an open row offers to filter by, e.g. `Event name: x`. */
export interface UwtInspectorFilterBy {
  path: string;
  /** The field as people read it. */
  name: string;
  value: string;
}

/** The fields worth filtering by, for each kind of event. */
const FILTER_BY: Partial<Record<UwtTelemetryEventKind, readonly string[]>> = {
  bi: ['eventName', 'feature'],
  scenario: ['scenarioName', 'status'],
  'scenario-step': ['scenarioName', 'status'],
  log: ['logger', 'level']
};

/** One timeline row: display text, plus the entry for the detail view. */
export interface UwtInspectorRow {
  sequence: number;
  time: string;
  /** `BI`, `Scenario`, `Step`, `Log` or `Error`. */
  kind: string;
  /** The event, scenario, step, logger or error name. */
  name: string;
  details: string;
  tone?: UwtInspectorTone;
  /** Secondary: hidden on narrow screens. */
  eventType: string;
  /** Secondary: the scenario id, or a log's correlation id. */
  id: string;
  forwardedFrom?: string;
  /** The row's own values of the fields worth filtering by. */
  filterBy: UwtInspectorFilterBy[];
  entry: UwtInspectorEntry;
}

type RowText = Pick<
  UwtInspectorRow,
  'kind' | 'name' | 'details' | 'tone' | 'id'
>;

/** Reads a field as text, whatever the payload's declared type. */
function text(payload: unknown, key: string): string {
  if (payload === null || typeof payload !== 'object') {
    return '';
  }
  const value = (payload as Record<string, unknown>)[key];
  return value === undefined || value === null ? '' : String(value);
}

/** The first three metadata pairs, `key=value`. */
function metadataSummary(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') {
    return '';
  }
  const metadata = (payload as Record<string, unknown>).metadata;
  if (metadata === null || typeof metadata !== 'object') {
    return '';
  }
  const pairs = Object.entries(metadata as Record<string, unknown>);
  const shown = pairs
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(', ');
  return pairs.length > 3 ? `${shown}, …` : shown;
}

function ms(value: string): string {
  return value === '' ? '' : `${value} ms`;
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(' · ');
}

function statusTone(status: string): UwtInspectorTone | undefined {
  switch (status) {
    case 'success':
      return 'success';
    case 'failure':
    case 'timeout':
      return 'error';
    case 'abandoned':
    case 'incomplete':
      return 'warn';
    default:
      return undefined;
  }
}

function levelTone(level: string): UwtInspectorTone | undefined {
  return level === 'warn' ? 'warn' : level === 'error' ? 'error' : undefined;
}

function describe(event: UwtTelemetryObservedEvent): RowText {
  const p = event.payload;
  switch (event.kind) {
    case 'bi':
      return {
        kind: 'BI',
        name: text(p, 'eventName'),
        details: metadataSummary(p),
        id: text(p, 'scenarioId')
      };
    case 'scenario': {
      const status = text(p, 'status');
      const steps = text(p, 'stepCount');
      return {
        kind: 'Scenario',
        name: text(p, 'scenarioName'),
        details: join(
          status,
          ms(text(p, 'delta')),
          steps && `${steps} step${steps === '1' ? '' : 's'}`
        ),
        tone: statusTone(status),
        id: text(p, 'scenarioId')
      };
    }
    case 'scenario-step': {
      const status = text(p, 'status');
      return {
        kind: 'Step',
        name: join(text(p, 'scenarioName'), text(p, 'name')),
        details: join(status, ms(text(p, 'stepDelta'))),
        tone: statusTone(status),
        id: text(p, 'scenarioId')
      };
    }
    case 'log': {
      const level = text(p, 'level');
      return {
        kind: 'Log',
        name: text(p, 'logger'),
        details: join(level, text(p, 'message')),
        tone: levelTone(level),
        id: text(p, 'correlationId')
      };
    }
    case 'error':
      return {
        kind: 'Error',
        name: text(p, 'name'),
        details: join('→ RUM', text(p, 'message')),
        tone: 'error',
        id: ''
      };
    default:
      // Forwarded from another app, of a type this one doesn't know.
      return {
        kind: 'BI',
        name: 'eventType' in event ? event.eventType : '',
        details: 'unrecognised event type',
        id: ''
      };
  }
}

/** `HH:MM:SS.mmm` in local time — the precision that orders a burst. */
export function uwtInspectorTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}.${pad(date.getMilliseconds(), 3)}`;
}

export function uwtInspectorRow(entry: UwtInspectorEntry): UwtInspectorRow {
  const { event } = entry;
  let described: RowText;
  let filterBy: UwtInspectorFilterBy[];
  try {
    described = describe(event);
    filterBy = (FILTER_BY[event.kind] ?? [])
      .map((path) => ({
        path,
        name: uwtFieldName(path),
        value: text(event.payload, path)
      }))
      .filter((f) => f.value);
  } catch {
    described = { kind: '', name: '', details: '', id: '' };
    filterBy = [];
  }
  return {
    sequence: event.sequence,
    time: uwtInspectorTime(event.capturedAt),
    ...described,
    eventType: 'eventType' in event ? event.eventType : '',
    forwardedFrom: event.origin.forwarded
      ? (event.origin.application ?? 'another app')
      : undefined,
    filterBy,
    entry
  };
}
