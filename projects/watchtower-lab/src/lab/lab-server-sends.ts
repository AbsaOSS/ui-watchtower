/**
 * What the lab's destinations were asked to send while the server rendered:
 * nothing, unless the library's browser guards slip. On the server a send
 * can't reach anything — its URL is relative — so it would fail unseen;
 * here it is kept instead, on `globalThis`, where the mock backend, in the
 * same process, reads it for `/__lab/state`.
 */
const KEY = '__labServerSends';

type Kept = { [KEY]?: string[] };

/**
 * Keeps `what` — say `POST /api/logs` — when on the server, where it is
 * then not sent.
 *
 * @returns whether it was kept, so the caller doesn't send it
 */
export function labSentOnServer(what: string): boolean {
  if (typeof window !== 'undefined') {
    return false;
  }
  ((globalThis as Kept)[KEY] ??= []).push(what);
  return true;
}

/** What was kept since the last {@link labClearServerSends}. */
export function labServerSends(): readonly string[] {
  return (globalThis as Kept)[KEY] ?? [];
}

export function labClearServerSends(): void {
  (globalThis as Kept)[KEY] = [];
}
