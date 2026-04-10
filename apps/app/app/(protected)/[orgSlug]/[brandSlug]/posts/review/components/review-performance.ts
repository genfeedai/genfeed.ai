import type { IBatchItem } from '@genfeedai/interfaces';

export type ReviewPerformanceSignal =
  | 'winning'
  | 'underperforming'
  | 'awaiting_analytics'
  | null;

export function getReviewPerformanceSignal(
  item: IBatchItem,
): ReviewPerformanceSignal {
  if (!item.postStatus || item.postStatus !== 'public') {
    return null;
  }

  if (
    item.postTotalViews === undefined &&
    item.postAvgEngagementRate === undefined
  ) {
    return 'awaiting_analytics';
  }

  const views = item.postTotalViews ?? 0;
  const engagementRate = item.postAvgEngagementRate ?? 0;

  if (views >= 1000 || engagementRate >= 6) {
    return 'winning';
  }

  if (views > 0 && engagementRate < 2) {
    return 'underperforming';
  }

  return null;
}

export function getReviewPerformanceLabel(
  signal: ReviewPerformanceSignal,
): string | null {
  switch (signal) {
    case 'awaiting_analytics':
      return 'Awaiting analytics';
    case 'underperforming':
      return 'Underperforming';
    case 'winning':
      return 'Winning';
    default:
      return null;
  }
}
