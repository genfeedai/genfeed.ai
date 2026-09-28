export const OPEN_TASK_COMPOSER_EVENT = 'workspace:open-task-composer';

// The sidebar and ⌘⇧N live outside the lazily loaded workspace page, so a
// request can arrive just before the page listens. It is held briefly; an old
// request (made on a route without the page) never opens the composer later.
const PENDING_REQUEST_TTL_MS = 5000;
let pendingRequestAt: number | null = null;

export function dispatchOpenTaskComposer() {
  pendingRequestAt = Date.now();
  window.dispatchEvent(new Event(OPEN_TASK_COMPOSER_EVENT));
}

/** Takes a recent open request, if any, so it opens the composer once. */
export function consumeOpenTaskComposerRequest(): boolean {
  const requestedAt = pendingRequestAt;
  pendingRequestAt = null;
  return (
    requestedAt !== null && Date.now() - requestedAt <= PENDING_REQUEST_TTL_MS
  );
}
