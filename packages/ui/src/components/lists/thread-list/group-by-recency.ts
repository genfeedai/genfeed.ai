import type { ThreadRecencyGroup } from '@genfeedai/props/ui/lists/thread-list.props';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ThreadRecencyBucket<TItem> {
  group: ThreadRecencyGroup;
  items: TItem[];
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Splits items into Today, the previous 7 days and Earlier, keeping the order
 * they came in and leaving out buckets with nothing in them. An item with no
 * usable date lands in Earlier.
 */
export function groupThreadsByRecency<TItem>(
  items: readonly TItem[],
  getDate: (item: TItem) => string | Date | null | undefined,
  now: Date = new Date(),
): ThreadRecencyBucket<TItem>[] {
  const todayStart = startOfDay(now);
  const buckets: Record<ThreadRecencyGroup, TItem[]> = {
    earlier: [],
    last7Days: [],
    today: [],
  };

  for (const item of items) {
    const raw = getDate(item);
    const time = raw ? new Date(raw).getTime() : Number.NaN;
    if (Number.isNaN(time) || time < todayStart - 6 * DAY_MS) {
      buckets.earlier.push(item);
    } else if (time >= todayStart) {
      buckets.today.push(item);
    } else {
      buckets.last7Days.push(item);
    }
  }

  return (['today', 'last7Days', 'earlier'] as const)
    .filter((group) => buckets[group].length > 0)
    .map((group) => ({ group, items: buckets[group] }));
}

/**
 * The date on the right of a thread row: the time for today, the day and month
 * for anything older, so the column stays narrow.
 */
export function formatThreadTime(
  value: string | Date | null | undefined,
  locale: string,
  now: Date = new Date(),
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return startOfDay(date) === startOfDay(now)
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
