export type ToolRaceOutcome<T> =
  | { kind: 'settled'; value: T }
  | { kind: 'cancelled' }
  | { kind: 'timed-out' };

/**
 * Wait for a tool call, but stop waiting when the run is cancelled or the
 * call outlives its timeout. The abandoned call is left to finish on its own;
 * its rejection is swallowed so it cannot surface as an unhandled rejection.
 */
export async function raceToolExecution<T>(
  execution: Promise<T>,
  options: {
    isCancelled?: () => Promise<boolean>;
    pollIntervalMs: number;
    timeoutMs: number;
  },
): Promise<ToolRaceOutcome<T>> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let pollHandle: ReturnType<typeof setTimeout> | undefined;
  let isDone = false;

  const settled = execution.then(
    (value): ToolRaceOutcome<T> => ({ kind: 'settled', value }),
  );
  settled.catch(() => undefined);
  const timedOut = new Promise<ToolRaceOutcome<T>>((resolve) => {
    timeoutHandle = setTimeout(
      () => resolve({ kind: 'timed-out' }),
      options.timeoutMs,
    );
  });
  const cancelled = new Promise<ToolRaceOutcome<T>>((resolve) => {
    const { isCancelled } = options;
    if (!isCancelled) {
      return;
    }
    const poll = async (): Promise<void> => {
      if (isDone) {
        return;
      }
      try {
        if (await isCancelled()) {
          resolve({ kind: 'cancelled' });
          return;
        }
      } catch {
        // A transient lookup failure must not end the run; poll again.
      }
      if (!isDone) {
        pollHandle = setTimeout(poll, options.pollIntervalMs);
      }
    };
    pollHandle = setTimeout(poll, options.pollIntervalMs);
  });

  try {
    return await Promise.race([settled, timedOut, cancelled]);
  } finally {
    isDone = true;
    clearTimeout(timeoutHandle);
    clearTimeout(pollHandle);
  }
}
