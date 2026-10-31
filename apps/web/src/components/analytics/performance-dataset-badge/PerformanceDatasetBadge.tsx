import type { PerformanceDatasetConfidence } from '@genfeedai/contracts/interfaces';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

export interface PerformanceDatasetBadgeProps {
  confidence: PerformanceDatasetConfidence;
}

const CONFIDENCE_BADGE_VARIANT: Record<
  PerformanceDatasetConfidence,
  'warning' | 'info' | 'success'
> = {
  high: 'success',
  low: 'warning',
  medium: 'info',
  none: 'warning',
};

/**
 * Shared confidence badge for a `PlanPerformanceContext`/`IWeeklyPerformanceSummary`
 * dataset — the analytics overview and the "generate plan now" flow both
 * badge the same underlying confidence, so they share this component and its
 * `pages.analytics.performanceDataset` copy rather than duplicating labels.
 */
export default function PerformanceDatasetBadge({
  confidence,
}: PerformanceDatasetBadgeProps) {
  const translate = useTranslations('pages.analytics.performanceDataset');

  return (
    <Badge variant={CONFIDENCE_BADGE_VARIANT[confidence]}>
      {translate(`confidence.${confidence}`)}
    </Badge>
  );
}

export const LOW_CONFIDENCE_STATES: PerformanceDatasetConfidence[] = [
  'none',
  'low',
];
