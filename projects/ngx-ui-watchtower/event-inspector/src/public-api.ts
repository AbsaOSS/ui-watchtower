/*
 * Public API Surface of ngx-ui-watchtower/event-inspector
 *
 * The Event Inspector: an in-app popup showing, live, every event this app hands to its
 * telemetry destinations. Needs cps-ui-kit.
 */

export {
  UWT_EVENT_INSPECTOR_CONFIG,
  UwtInspectorExport,
  UwtInspectorFieldFilter,
  UwtInspectorFilterOperator,
  UwtInspectorFilterState,
  UwtInspectorSectionId,
  UwtInspectorShortcut,
  UwtEventInspectorConfig
} from './lib/uwt-inspector.models/uwt-inspector.models';
export { UWT_DEFAULT_INSPECTOR_SHORTCUTS } from './lib/uwt-inspector-shortcut/uwt-inspector-shortcut';
export { UWT_DEFAULT_INSPECTOR_CONFIG } from './lib/uwt-inspector-store/uwt-inspector-store';
export { provideUwtEventInspector } from './lib/uwt-inspector.providers/uwt-inspector.providers';
export { UwtEventInspectorService } from './lib/uwt-event-inspector.service/uwt-event-inspector.service';
