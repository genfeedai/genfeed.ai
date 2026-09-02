export interface SaveQueue {
  /**
   * Runs `task` only after every previously enqueued task has settled, so two
   * rapid saves can never overlap or drop one another. The returned promise
   * settles with the task's own result, letting callers (e.g. `EditableText`)
   * revert their draft on rejection. A rejected task never blocks the queue.
   */
  enqueueSave: <T>(task: () => Promise<T>) => Promise<T>;
  /**
   * Resolves once every currently queued save has settled, for callers that
   * write outside the queue and must not race it. Never rejects.
   */
  waitForIdle: () => Promise<void>;
  isSaving: boolean;
}
