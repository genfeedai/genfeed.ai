'use client';

import type { IViralHookAnalysis } from '@genfeedai/contracts/interfaces/analytics/viral-hooks.interface';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { Clock, Eye, Heart, TrendingUp } from 'lucide-react';

type Props = {
  analysisData: IViralHookAnalysis;
  formatTimeSpent: (seconds: number) => string;
  isLoading?: boolean;
};

export default function HookStatCards({
  analysisData,
  formatTimeSpent,
  isLoading = false,
}: Props) {
  return (
    <MetricCardGrid columns={4}>
      <MetricCard
        icon={Eye}
        isLoading={isLoading}
        label="Total Videos Analyzed"
        size="md"
        value={String(analysisData.totalVideos)}
      />
      <MetricCard
        icon={Clock}
        isLoading={isLoading}
        label="Total Time Tracked"
        size="md"
        value={formatTimeSpent(analysisData.totalTime)}
      />
      <MetricCard
        icon={TrendingUp}
        isLoading={isLoading}
        label="Avg Time per Video"
        size="md"
        value={formatTimeSpent(analysisData.avgTimePerVideo)}
      />
      <MetricCard
        icon={Heart}
        isLoading={isLoading}
        label="Top Platform"
        size="md"
        value={
          analysisData.topPlatforms[0]
            ? analysisData.topPlatforms[0].platform.toUpperCase()
            : 'N/A'
        }
      />
    </MetricCardGrid>
  );
}
