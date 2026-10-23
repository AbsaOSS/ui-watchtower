/**
 * When each RUM session started, so a scenario record can say how far into
 * its session it happened (`sessionElapsed`).
 *
 * The RUM client keeps no start time, so the destination that owns the
 * session records the moment each session starts. Kept in `localStorage`,
 * because the session outlives the page — the client keeps its id in a
 * cookie across reloads and tabs. Where storage is blocked, nothing is kept.
 */

const STORAGE_KEY = 'ngx-ui-watchtower.sessionStarts';

/**
 * Sessions remembered. More than one, because tabs can drift onto
 * different sessions, and a tab that reloads must still find its own.
 */
const MAX_SESSIONS = 5;

/** A session id and its start, in epoch milliseconds. */
type SessionStart = [sessionId: string, startedAt: number];

function isSessionStart(value: unknown): value is SessionStart {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

/** What storage holds, or `undefined` when it can't be read. */
function readStored(): SessionStart[] | undefined {
  let raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked, or absent (server rendering).
    return undefined;
  }
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSessionStart) : [];
  } catch {
    // A value that isn't ours: start afresh, and overwrite it on the next mark.
    return [];
  }
}

/**
 * Records `now` as the start of `sessionId`, unless its start is already
 * known. Called by the destination that owns sessions when one starts — the
 * RUM sink does it on the client's own `session_start` event.
 *
 * @param sessionId the session that has started
 * @param now the start, in epoch milliseconds; defaults to the current time.
 *   Ignored unless it is a finite number.
 *
 * @group Utils
 */
export function uwtMarkSessionStart(sessionId: string, now = Date.now()): void {
  if (!sessionId || !Number.isFinite(now)) {
    return;
  }
  const stored = readStored();
  if (!stored || stored.some(([id]) => id === sessionId)) {
    return;
  }
  const entry: SessionStart = [sessionId, now];
  try {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([entry, ...stored].slice(0, MAX_SESSIONS))
    );
  } catch {
    // Storage full or blocked for writes: the start is simply not kept.
  }
}

/**
 * Milliseconds since `sessionId` started, when its start is known.
 *
 * @param sessionId the session to measure
 * @param now the moment to measure at, in epoch milliseconds
 * @returns the time since the session started, or `undefined` when the
 *   session or its start is unknown
 *
 * @group Utils
 */
export function uwtSessionElapsed(
  sessionId: string | undefined,
  now = Date.now()
): number | undefined {
  if (!sessionId) {
    return undefined;
  }
  const startedAt = readStored()?.find(([id]) => id === sessionId)?.[1];
  return startedAt === undefined ? undefined : now - startedAt;
}
