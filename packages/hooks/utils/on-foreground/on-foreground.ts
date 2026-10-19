/** Window in which the focus and visibilitychange of one tab return coalesce. */
export const FOREGROUND_COALESCE_MS = 1_000;

/**
 * Calls `callback` when the tab returns to the foreground. Returning to a tab
 * fires `focus` and `visibilitychange` together, so listening to both directly
 * runs the callback twice; this runs it once per return, and never while the
 * document is hidden. Returns a disposer.
 */
export function onForeground(
  callback: () => void,
  coalesceMs: number = FOREGROUND_COALESCE_MS,
): () => void {
  let lastRunAt = Number.NEGATIVE_INFINITY;
  const handle = () => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    const now = Date.now();
    if (now - lastRunAt < coalesceMs) {
      return;
    }
    lastRunAt = now;
    callback();
  };

  window.addEventListener('focus', handle);
  document.addEventListener('visibilitychange', handle);

  return () => {
    window.removeEventListener('focus', handle);
    document.removeEventListener('visibilitychange', handle);
  };
}
