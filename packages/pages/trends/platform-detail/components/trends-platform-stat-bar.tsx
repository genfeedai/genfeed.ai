'use client';

import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';

type TrendsPlatformStatBarProps = {
  feedModeLabel: string;
  totalTrends: number;
  totalItems: number;
  videoCount?: number;
};

/**
 * Same metric hierarchy as Discovery overview: MetricCardGrid + MetricCard.
 * No bespoke label/value bar.
 */
export default function TrendsPlatformStatBar({
  feedModeLabel,
  totalTrends,
  totalItems,
  videoCount,
}: TrendsPlatformStatBarProps) {
  const showVideos = typeof videoCount === 'number';

  return (
    <MetricCardGrid className="mb-5" columns={showVideos ? 4 : 3}>
      <MetricCard label="Feed type" value={feedModeLabel} size="sm" />
      <MetricCard label="Trend topics" value={totalTrends} size="sm" />
      <MetricCard label="Source items" value={totalItems} size="sm" />
      {showVideos ? (
        <MetricCard label="Viral videos" value={videoCount} size="sm" />
      ) : null}
    </MetricCardGrid>
  );
}
