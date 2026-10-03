'use client';

import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { TrendDetailData } from '@props/trends/trends-page.props';
import Card from '@ui/card/Card';
import { ChartColumn, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

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
      return <ChartColumn className="size-5 text-warning" />;
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
  const translate = useTranslations('pages.analytics.trends.detail.analysis');

  return (
    <Card label={translate('title')} icon={ChartColumn}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">
            {translate('direction')}
          </span>
          <div className="flex items-center gap-2">
            {getTrendDirectionIcon(analysis.trendDirection)}
            <span className="text-lg font-semibold capitalize">
              {analysis.trendDirection}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">
            {translate('avgVirality')}
          </span>
          <div className="text-lg font-semibold">
            {analysis.averageViralityScore}/100
          </div>
        </div>
        <div className="space-y-2">
          <span className="text-sm text-foreground/60">
            {translate('growthRate')}
          </span>
          <div
            className={`text-lg font-semibold ${getGrowthRateClass(analysis.growthRate)}`}
          >
            {analysis.growthRate > 0 ? '+' : ''}
            {analysis.growthRate}%
          </div>
        </div>
      </div>
      {analysis.peakDate && (
        <div className="mt-4 pt-4 border-t border-border">
          <span className="text-sm text-foreground/60">
            {translate('peak', {
              date: formatDate(analysis.peakDate),
              mentions: formatCompactNumber(analysis.peakMentions || 0),
            })}
          </span>
        </div>
      )}
    </Card>
  );
}
