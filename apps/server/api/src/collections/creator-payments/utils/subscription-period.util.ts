/**
 * One calendar month later in UTC, clamped to the last day of the target
 * month: a subscription started on Jan 31 renews on Feb 28 (or 29), not Mar 3.
 */
export function addOneMonth(value: Date): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
