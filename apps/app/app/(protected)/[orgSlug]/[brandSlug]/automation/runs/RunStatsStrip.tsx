'use client';

import type { RunStatsStripProps } from '@props/automation/run-stats-strip.props';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Coins,
  ListChecks,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

/** A statistics payload missing a counter must not unmount the runs page. */
function formatStat(value: number | undefined): string {
  const amount =
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return amount.toLocaleString('en-US');
}

/** Same KPI cards as the other overviews; five stats on one row at desktop. */
export default function RunStatsStrip({
  isLoading,
  isStatsDegraded = false,
  stats,
}: RunStatsStripProps) {
  const translate = useTranslations('common.automation.workflowExecutions');
  const degradedDescription = isStatsDegraded
    ? translate('statsDegraded')
    : undefined;
  return (
    <KPISection
      gridCols={{ desktop: 5, mobile: 2, tablet: 3 }}
      isLoading={isLoading}
      items={[
        {
          description: degradedDescription,
          icon: ListChecks,
          label: translate('statsTotal'),
          value: formatStat(stats.total),
        },
        {
          // Not marked degraded: `active` is always recomputed from the
          // execution list just fetched, never a stale fallback.
          icon: Activity,
          label: translate('statsActive'),
          value: formatStat(stats.active),
        },
        {
          description: degradedDescription,
          icon: CheckCircle2,
          label: translate('statsCompleted'),
          value: formatStat(stats.completed),
        },
        {
          description: degradedDescription,
          icon: CircleAlert,
          label: translate('statsFailed'),
          value: formatStat(stats.failed),
        },
        {
          description: degradedDescription,
          icon: Coins,
          label: translate('statsCredits'),
          value: formatStat(stats.totalCredits),
        },
      ]}
    />
  );
}
