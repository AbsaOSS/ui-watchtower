/**
 * What came after 0.5.0: the telemetry monitor, and the
 * `/event-inspector` entry point that reads it, used the way an application
 * uses them. Kept apart from `compat.ts`, which must keep compiling
 * unchanged as an application written before them.
 *
 * Compiled by `npm run typecheck`, never run.
 */
import {
  ApplicationConfig,
  inject,
  Injectable,
  InjectionToken
} from '@angular/core';
import { Observable } from 'rxjs';
import {
  UwtJsonObject,
  UwtJsonValue,
  UwtTelemetryDestination,
  UwtTelemetryEventKind,
  UwtTelemetryEventOrigin,
  UwtTelemetryMonitor,
  UwtTelemetryObservedEvent,
  UwtTelemetryPublishInput
} from '@absaoss-cps/ngx-ui-watchtower';
import {
  provideUwtEventInspector,
  UWT_DEFAULT_INSPECTOR_CONFIG,
  UWT_DEFAULT_INSPECTOR_SHORTCUTS,
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtEventInspectorConfig,
  UwtEventInspectorService,
  UwtInspectorDock,
  UwtInspectorExport,
  UwtInspectorFieldFilter,
  UwtInspectorFilterOperator,
  UwtInspectorFilterState,
  UwtInspectorKindFilter,
  UwtInspectorSectionId,
  UwtInspectorShortcut
} from '@absaoss-cps/ngx-ui-watchtower/event-inspector';

/** The Event Inspector, set up with a shortcut of the application's own. */
const shortcut: UwtInspectorShortcut = { code: 'KeyE', ctrl: true, alt: true };
const config: Partial<UwtEventInspectorConfig> = {
  ...UWT_DEFAULT_INSPECTOR_CONFIG,
  shortcuts: [...UWT_DEFAULT_INSPECTOR_SHORTCUTS, shortcut],
  enabled: () => true
};
export const inspectorConfig: ApplicationConfig = {
  providers: [provideUwtEventInspector(config)]
};
export const token: InjectionToken<UwtEventInspectorConfig> =
  UWT_EVENT_INSPECTOR_CONFIG;

/** Opening the inspector, and watching what telemetry hands over. */
@Injectable()
export class Diagnostics {
  private readonly inspector = inject(UwtEventInspectorService);
  private readonly monitor = inject(UwtTelemetryMonitor);

  /** Every event, as it is handed over. */
  readonly events$: Observable<UwtTelemetryObservedEvent> =
    this.monitor.events$;

  show(dock: UwtInspectorDock = 'right'): boolean {
    this.inspector.setDock(dock);
    this.inspector.open();
    return this.inspector.isOpen() && this.monitor.observed;
  }

  describe(event: UwtTelemetryObservedEvent): string {
    const kind: UwtTelemetryEventKind = event.kind;
    const where: UwtTelemetryDestination = event.destination;
    const origin: UwtTelemetryEventOrigin = event.origin;
    if (event.kind === 'unknown') {
      const payload: UwtJsonObject = event.payload;
      const value: UwtJsonValue | undefined = payload.count;
      return `${kind} ${where} ${String(value)}`;
    }
    return origin.forwarded ? `${kind} from ${origin.application}` : kind;
  }

  record(): number | undefined {
    const input: UwtTelemetryPublishInput = {
      kind: 'unknown',
      eventType: 'custom.event',
      payload: { count: 1 },
      destination: 'sink',
      origin: { forwarded: false }
    };
    return this.monitor.publish(input);
  }
}

/** A saved export, read back the way a script would. */
export function sections(saved: UwtInspectorExport): UwtInspectorSectionId[] {
  const operator: UwtInspectorFilterOperator = 'contains';
  const field: UwtInspectorFieldFilter = {
    id: 'f1',
    operator,
    path: 'payload.eventName',
    value: 'export'
  };
  const filters: UwtInspectorFilterState = { text: '', fields: [field] };
  const kind: UwtInspectorKindFilter = 'all';
  return saved.events.length && filters.fields.length && kind === 'all'
    ? ['bi', 'scenario', 'logging']
    : [];
}
