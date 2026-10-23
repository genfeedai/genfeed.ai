import type { ITurboRunItem } from '@genfeedai/contracts/interfaces';
import type { useTranslations } from 'next-intl';

export type ReviewPerformanceSignal =
  | 'winning'
  | 'underperforming'
  | 'awaiting_analytics'
  | null;

export function getReviewPerformanceSignal(
  item: ITurboRunItem,
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
  translate: ReturnType<typeof useTranslations>,
): string | null {
  switch (signal) {
    case 'awaiting_analytics':
      return translate('performance.awaiting');
    case 'underperforming':
      return translate('performance.underperforming');
    case 'winning':
      return translate('performance.winning');
    default:
      return null;
  }
}
