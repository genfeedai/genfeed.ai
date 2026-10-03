import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { Props } from '@props/analytics/hook-stat-cards.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { Eye, Heart, Sparkles, TrendingUp } from 'lucide-react';

export default function HookStatCards({
  analysisData,
  isLoading = false,
}: Props) {
  const bestHook = analysisData.topHooks[0];
  const topPlatform = analysisData.topPlatforms[0];

  return (
    <MetricCardGrid columns={4}>
      <MetricCard
        icon={Eye}
        isLoading={isLoading}
        analyticsMetric="posts"
        label="Posts Analyzed"
        size="md"
        value={String(analysisData.totalVideos)}
      />
      <MetricCard
        icon={Sparkles}
        isLoading={isLoading}
        label="Hook Patterns"
        size="md"
        value={String(analysisData.hookEffectiveness.length)}
      />
      <MetricCard
        icon={TrendingUp}
        isLoading={isLoading}
        label="Best Hook Avg Engagement"
        size="md"
        value={bestHook ? formatCompactNumber(bestHook.avgEngagement) : 'N/A'}
      />
      <MetricCard
        icon={Heart}
        isLoading={isLoading}
        label="Top Platform"
        size="md"
        value={topPlatform ? topPlatform.platform.toUpperCase() : 'N/A'}
      />
    </MetricCardGrid>
  );
}
