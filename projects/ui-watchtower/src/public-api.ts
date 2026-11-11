/*
 * Public API Surface of ui-watchtower
 *
 * The framework-independent engine. Nothing here imports a framework, and
 * nothing touches a browser global when imported.
 */

// Utilities a destination needs
export { uwtMarkSessionStart } from './lib/utils/uwt-session-start.util/uwt-session-start.util';

// Used by @absaoss-cps/ngx-ui-watchtower while the engine moves into this
// package; removed from the public API once that code lives here too.
export { uwtSessionElapsed } from './lib/utils/uwt-session-start.util/uwt-session-start.util';
