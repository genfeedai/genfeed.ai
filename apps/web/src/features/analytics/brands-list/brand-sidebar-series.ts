import { sumEngagement } from '@genfeedai/contracts/analytics';
import type { BrandSidebarPlatformShare } from '@/features/analytics/props/analytics-brand-summary.props';

type Reading = Record<string, unknown>;

function isReading(value: unknown): value is Reading {
  return typeof value === 'object' && value !== null;
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Engagement of one platform on one day. The time-series endpoint returns a
 * metrics object per platform; a bare number is read as the total.
 */
function readEngagement(value: unknown): number {
  if (isReading(value)) {
    return sumEngagement({
      comments: readCount(value.comments),
      likes: readCount(value.likes),
      saves: readCount(value.saves),
      shares: readCount(value.shares),
    });
  }

  return readCount(value);
}

function platformEntries(row: unknown): [string, number][] {
  if (!isReading(row)) {
    return [];
  }

  return Object.entries(row)
    .filter(([key]) => key !== 'date')
    .map(([platform, value]): [string, number] => [
      platform,
      readEngagement(value),
    ]);
}

/** Total engagement per day across every platform, oldest first. */
export function toEngagementSeries(rows: unknown[]): number[] {
  return rows.map((row) =>
    platformEntries(row).reduce(
      (total, [, engagement]) => total + engagement,
      0,
    ),
  );
}

/** Engagement per platform over the whole range, largest first. */
export function toPlatformShares(rows: unknown[]): BrandSidebarPlatformShare[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    for (const [platform, engagement] of platformEntries(row)) {
      totals.set(platform, (totals.get(platform) ?? 0) + engagement);
    }
  }

  const grandTotal = [...totals.values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  return [...totals.entries()]
    .filter(([, engagement]) => engagement > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([platform, engagement]) => ({
      engagement,
      platform,
      share: (engagement / grandTotal) * 100,
    }));
}
