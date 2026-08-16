/**
 * How long a thread-switch fetch is delayed when the user just left another
 * thread (#2790). Cache restore still happens immediately so the track never
 * blanks; only the network set is deferred. A first open (or a remount of
 * the same thread, including React Strict Mode) is never delayed.
 */
export const THREAD_SWITCH_DEBOUNCE_MS = 80;

export interface ThreadSwitchFetchPlan {
  shouldFetchMessages: boolean;
  shouldFetchSnapshot: boolean;
  shouldFetchThread: boolean;
}

export function planThreadSwitchFetches(input: {
  hasInFlightHydration: boolean;
  /**
   * The visible thread already owns a live client-side run (streaming or an
   * active run id) — the first prompt on `/agent/new` lands here when the URL
   * catches up to the thread the store already created. The socket stream is
   * the source of truth for that turn; a messages/snapshot page fetched now
   * would predate it and blank the transcript and the pending generation card.
   */
  hasLiveLocalRun?: boolean;
  isCacheFresh: boolean;
}): ThreadSwitchFetchPlan {
  const shouldHydrate = !input.hasInFlightHydration && !input.hasLiveLocalRun;

  // Prefetch never loads the thread record. A stale cache still needs it even
  // when messages+snapshot are already in flight from a hover.
  return {
    shouldFetchMessages: shouldHydrate,
    shouldFetchSnapshot: !input.isCacheFresh && shouldHydrate,
    shouldFetchThread: !input.isCacheFresh,
  };
}

export function shouldDelayThreadSwitchFetch(input: {
  debounceMs: number;
  lastSwitchAt: number | null;
  lastThreadId: string | null;
  now: number;
  threadId: string;
}): boolean {
  if (input.lastThreadId === null || input.lastThreadId === input.threadId) {
    return false;
  }

  if (input.lastSwitchAt === null) {
    return false;
  }

  return input.now - input.lastSwitchAt < input.debounceMs;
}
