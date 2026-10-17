/**
 * The rail ids with `id` moved onto `targetId`'s slot, the way a drop lands.
 * Returns the same array when nothing moves.
 */
export function moveRailAppBefore(
  ids: readonly string[],
  id: string,
  targetId: string,
): readonly string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = ids.filter((candidate) => candidate !== id);
  next.splice(to, 0, id);
  return next;
}

/** The rail ids with `id` shifted by `delta` slots, clamped to the ends. */
export function moveRailAppBy(
  ids: readonly string[],
  id: string,
  delta: number,
): readonly string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const to = Math.min(Math.max(from + delta, 0), ids.length - 1);
  if (to === from) return ids;
  const next = ids.filter((candidate) => candidate !== id);
  next.splice(to, 0, id);
  return next;
}
