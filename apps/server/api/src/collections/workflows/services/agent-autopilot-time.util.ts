// Credit windows reset at fixed UTC boundaries so they do not move with the
// host timezone.
export function getNextDailyReset(now: Date = new Date()): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function getNextWeeklyReset(now: Date = new Date()): Date {
  const next = new Date(now);
  const dayOfWeek = next.getUTCDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}
