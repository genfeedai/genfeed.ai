'use client';

import type { IViralHookAnalysis } from '@genfeedai/interfaces/analytics/viral-hooks.interface';
import StatCard from '@ui/cards/stat-card/StatCard';
import { Clock, Eye, Heart, TrendingUp } from 'lucide-react';

type Props = {
  analysisData: IViralHookAnalysis;
  formatTimeSpent: (seconds: number) => string;
};

export default function HookStatCards({
  analysisData,
  formatTimeSpent,
}: Props) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={Eye}
        label="Total Videos Analyzed"
        value={analysisData.totalVideos}
      />
      <StatCard
        icon={Clock}
        label="Total Time Tracked"
        value={formatTimeSpent(analysisData.totalTime)}
      />
      <StatCard
        icon={TrendingUp}
        label="Avg Time per Video"
        value={formatTimeSpent(analysisData.avgTimePerVideo)}
      />
      <StatCard
        icon={Heart}
        label="Top Platform"
        value={
          analysisData.topPlatforms[0]
            ? analysisData.topPlatforms[0].platform.toUpperCase()
            : 'N/A'
        }
      />
    </section>
  );
}
