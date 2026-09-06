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

/** Same KPI cards as the other overviews; five stats on one row at desktop. */
export default function RunStatsStrip({
  isLoading,
  stats,
}: RunStatsStripProps) {
  const translate = useTranslations('common.automation.workflowExecutions');
  return (
    <KPISection
      gridCols={{ desktop: 5, mobile: 2, tablet: 3 }}
      isLoading={isLoading}
      items={[
        {
          icon: ListChecks,
          label: translate('statsTotal'),
          value: stats.total.toLocaleString(),
        },
        {
          icon: Activity,
          label: translate('statsActive'),
          value: stats.active.toLocaleString(),
        },
        {
          icon: CheckCircle2,
          label: translate('statsCompleted'),
          value: stats.completed.toLocaleString(),
        },
        {
          icon: CircleAlert,
          label: translate('statsFailed'),
          value: stats.failed.toLocaleString(),
        },
        {
          icon: Coins,
          label: translate('statsCredits'),
          value: stats.totalCredits.toLocaleString(),
        },
      ]}
    />
  );
}
