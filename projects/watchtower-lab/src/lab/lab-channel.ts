declare global {
  interface Window {
    __uwtTelemetryChannel?: string;
  }
}

/**
 * This tab's broadcast channel, as DESIGN.md §13 recommends for a composed
 * page open in several tabs: one per page load, so each tab's fragments
 * reach their own shell. Published on the window for the fragments to read,
 * before any of them starts; browser-only, so this module is safe under SSR.
 */
export const LAB_CHANNEL = `ngx-ui-watchtower-${crypto.randomUUID()}`;

if (typeof window !== 'undefined') {
  window.__uwtTelemetryChannel = LAB_CHANNEL;
}
