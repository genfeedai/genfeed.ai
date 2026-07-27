import type { SurfaceSummaryItem } from '@props/ui/dashboard/surface-summary-strip.props';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
import type { ReactElement } from 'react';

type MissionControlStatsGridProps = {
  stats: SurfaceSummaryItem[];
};

export function MissionControlStatsGrid({
  stats,
}: MissionControlStatsGridProps): ReactElement {
  return (
    <SurfaceSummaryStrip
      density="comfortable"
      items={stats}
      testId="mission-control-stats"
    />
  );
}
