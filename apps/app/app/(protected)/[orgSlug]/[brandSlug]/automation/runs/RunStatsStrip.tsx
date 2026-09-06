import type { RunStatsStripProps } from '@props/automation/run-stats-strip.props';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Coins,
  ListChecks,
} from 'lucide-react';

/** Same KPI cards as the other overviews; five stats on one row at desktop. */
export default function RunStatsStrip({
  isLoading,
  stats,
}: RunStatsStripProps) {
  return (
    <KPISection
      gridCols={{ desktop: 5, mobile: 2, tablet: 3 }}
      isLoading={isLoading}
      items={[
        {
          icon: ListChecks,
          label: 'Total',
          value: stats.total.toLocaleString(),
        },
        {
          icon: Activity,
          label: 'Active',
          value: stats.active.toLocaleString(),
        },
        {
          icon: CheckCircle2,
          label: 'Completed',
          value: stats.completed.toLocaleString(),
        },
        {
          icon: CircleAlert,
          label: 'Failed',
          value: stats.failed.toLocaleString(),
        },
        {
          icon: Coins,
          label: 'Credits',
          value: stats.totalCredits.toLocaleString(),
        },
      ]}
    />
  );
}
