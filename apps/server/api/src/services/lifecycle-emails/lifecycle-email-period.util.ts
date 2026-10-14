const DAY_MS = 86_400_000;

export function completedEmailPeriod(
  reference: Date,
  weekly: boolean,
): { start: Date; end: Date } {
  const end = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
  if (weekly) end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
  return { end, start: new Date(end.getTime() - (weekly ? 7 : 1) * DAY_MS) };
}
