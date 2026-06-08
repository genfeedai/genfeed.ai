'use client';

import type { IViralHookAnalysis } from '@genfeedai/interfaces/analytics/viral-hooks.interface';
import StatCard from '@ui/cards/stat-card/StatCard';
import { HiTrendingUp } from 'react-icons/hi';
import { HiClock, HiEye, HiHeart } from 'react-icons/hi2';

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
        icon={HiEye}
        label="Total Videos Analyzed"
        value={analysisData.totalVideos}
      />
      <StatCard
        icon={HiClock}
        label="Total Time Tracked"
        value={formatTimeSpent(analysisData.totalTime)}
      />
      <StatCard
        icon={HiTrendingUp}
        label="Avg Time per Video"
        value={formatTimeSpent(analysisData.avgTimePerVideo)}
      />
      <StatCard
        icon={HiHeart}
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
