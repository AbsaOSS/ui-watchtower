/**
 * How the lab was started, read once from the query string — the way an app
 * picks its configuration at startup:
 *
 * - `?destination=rum` (default) or `noop`
 * - `?telemetry=off` turns telemetry off with `withTelemetryEnabled(false)`
 * - `?inspector=off` disables the Event Inspector; `noshortcut` drops its
 *   keyboard shortcut
 */
export interface LabOptions {
  destination: 'rum' | 'noop';
  telemetry: boolean;
  inspector: 'on' | 'off' | 'noshortcut';
}

export function labOptions(search: string): LabOptions {
  const params = new URLSearchParams(search);
  const inspector = params.get('inspector');
  return {
    destination: params.get('destination') === 'noop' ? 'noop' : 'rum',
    telemetry: params.get('telemetry') !== 'off',
    inspector:
      inspector === 'off' || inspector === 'noshortcut' ? inspector : 'on'
  };
}
