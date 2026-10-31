/** Window in which the focus and visibilitychange of one tab return coalesce. */
export const FOREGROUND_COALESCE_MS = 1_000;

/** Away time under which a tab return is a glance, not a reason to refetch. */
export const FOREGROUND_MIN_AWAY_MS = 30_000;

interface OnForegroundOptions {
  /** Window in which the focus and visibilitychange of one return coalesce. */
  coalesceMs?: number;
  /**
   * Skip returns after the tab was away for less than this. Data that sockets
   * and polling keep fresh does not need a refetch on every tab switch.
   */
  minAwayMs?: number;
}

/**
 * Calls `callback` when the tab returns to the foreground. Returning to a tab
 * fires `focus` and `visibilitychange` together, so listening to both directly
 * runs the callback twice; this runs it once per return, and never while the
 * document is hidden. Returns a disposer.
 */
export function onForeground(
  callback: () => void,
  options: OnForegroundOptions = {},
): () => void {
  const { coalesceMs = FOREGROUND_COALESCE_MS, minAwayMs = 0 } = options;
  let lastRunAt = Number.NEGATIVE_INFINITY;
  let awaySince: number | null = null;

  const markAway = () => {
    awaySince ??= Date.now();
  };
  const handle = () => {
    if (document.visibilityState === 'hidden') {
      markAway();
      return;
    }
    const now = Date.now();
    if (now - lastRunAt < coalesceMs) {
      return;
    }
    const awayMs =
      awaySince === null ? Number.POSITIVE_INFINITY : now - awaySince;
    awaySince = null;
    if (awayMs < minAwayMs) {
      return;
    }
    lastRunAt = now;
    callback();
  };

  window.addEventListener('blur', markAway);
  window.addEventListener('focus', handle);
  document.addEventListener('visibilitychange', handle);

  return () => {
    window.removeEventListener('blur', markAway);
    window.removeEventListener('focus', handle);
    document.removeEventListener('visibilitychange', handle);
  };
}
