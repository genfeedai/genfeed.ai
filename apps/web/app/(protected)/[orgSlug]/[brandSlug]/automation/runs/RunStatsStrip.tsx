'use client';

import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Coins,
  ListChecks,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RunStatsStripProps } from '@/features/automation/props/run-stats-strip.props';

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
  // Stale fallback counters take the warning tone; one note explains why.
  const degradedTone = isStatsDegraded ? ('warning' as const) : undefined;
  return (
    <div className="mb-6 flex flex-col gap-2">
      <KPISection
        className="mb-0"
        gridCols={{ desktop: 5, mobile: 2 }}
        isLoading={isLoading}
        items={[
          {
            tone: degradedTone,
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
            tone: degradedTone,
            icon: CheckCircle2,
            label: translate('statsCompleted'),
            value: formatStat(stats.completed),
          },
          {
            tone: degradedTone,
            icon: CircleAlert,
            label: translate('statsFailed'),
            value: formatStat(stats.failed),
          },
          {
            tone: degradedTone,
            icon: Coins,
            label: translate('statsCredits'),
            value: formatStat(stats.totalCredits),
          },
        ]}
      />
      {isStatsDegraded ? (
        <p className="text-xs text-muted-foreground" role="status">
          {translate('statsDegraded')}
        </p>
      ) : null}
    </div>
  );
}
