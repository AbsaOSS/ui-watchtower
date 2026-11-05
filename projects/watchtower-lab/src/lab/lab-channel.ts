import { UWT_DEFAULT_BROADCAST_CHANNEL } from '@absaoss-cps/ngx-ui-watchtower';

declare global {
  interface Window {
    __uwtTelemetryChannel?: string;
  }
}

/**
 * This tab's own broadcast channel, as DESIGN.md §13 recommends for a
 * composed page open in several tabs: one per page load, so each tab's
 * fragments reach their own shell.
 */
const TAB_CHANNEL = `ngx-ui-watchtower-${crypto.randomUUID()}`;

/**
 * The shell's channel: this tab's own, or — `shared` — the default one every
 * tab joins, where the tabs' hosts elect one leader. Published on the window
 * for the fragments to read, before any of them starts; browser-only, so
 * this is safe under SSR.
 */
export function labChannel(shared: boolean): string {
  const channel = shared ? UWT_DEFAULT_BROADCAST_CHANNEL : TAB_CHANNEL;
  if (typeof window !== 'undefined') {
    window.__uwtTelemetryChannel = channel;
  }
  return channel;
}
