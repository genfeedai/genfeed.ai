/** Failed posts and posts scheduled in the next day need a publishing decision. */
export function needsPostAttention(
  status: string,
  scheduledAt?: string | Date | null,
  now = Date.now(),
): boolean {
  if (status.toLowerCase() === 'failed') return true;
  if (status.toLowerCase() !== 'scheduled' || !scheduledAt) return false;
  const instant = new Date(scheduledAt).getTime();
  return (
    Number.isFinite(instant) &&
    instant >= now &&
    instant <= now + 24 * 60 * 60 * 1000
  );
}
