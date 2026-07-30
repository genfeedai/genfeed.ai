'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendDetailData } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import { BarChart3, TrendingDown, TrendingUp } from 'lucide-react';

type TrendDetailAnalysisCardProps = {
  analysis: TrendDetailData['analysis'];
};

function getTrendDirectionIcon(
  direction: TrendDetailData['analysis']['trendDirection'],
) {
  switch (direction) {
    case 'rising':
      return <TrendingUp className="size-5 text-success" />;
    case 'falling':
      return <TrendingDown className="size-5 text-error" />;
    default:
      return <BarChart3 className="size-5 text-warning" />;
  }
}

function getGrowthRateClass(rate: number): string {
  if (rate > 0) {
    return 'text-success';
  }
  if (rate < 0) {
    return 'text-error';
  }
  return '';
}

export default function TrendDetailAnalysisCard({
  analysis,
}: TrendDetailAnalysisCardProps) {
  return (
    <Card label="Trend Analysis" icon={BarChart3}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">Direction</span>
          <div className="flex items-center gap-2">
            {getTrendDirectionIcon(analysis.trendDirection)}
            <span className="text-lg font-semibold capitalize">
              {analysis.trendDirection}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">Avg Virality (14d)</span>
          <div className="text-lg font-semibold">
            {analysis.averageViralityScore}/100
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">Growth Rate (14d)</span>
          <div
            className={`text-lg font-semibold ${getGrowthRateClass(analysis.growthRate)}`}
          >
            {analysis.growthRate > 0 ? '+' : ''}
            {analysis.growthRate}%
          </div>
        </div>
      </div>
      {analysis.peakDate && (
        <div className="mt-4 pt-4 border-t border-white/[0.08]">
          <span className="text-sm text-foreground/60">
            Peak: {formatCompactNumber(analysis.peakMentions || 0)} mentions on{' '}
            {new Date(analysis.peakDate).toLocaleDateString()}
          </span>
        </div>
      )}
    </Card>
  );
}
