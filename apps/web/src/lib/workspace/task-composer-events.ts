export const OPEN_TASK_COMPOSER_EVENT = 'workspace:open-task-composer';

// The sidebar and ⌘⇧N can fire before the shell host has subscribed. The
// request is held briefly so the first listener still opens the note.
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
