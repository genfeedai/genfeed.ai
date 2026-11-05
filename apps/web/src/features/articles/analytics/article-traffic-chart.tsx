'use client';

import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { ChartEmptyState } from '@ui/primitives/chart-empty-state';
import { useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ArticleTrafficChartProps } from '@/features/articles/props/article-traffic.props';

export default function ArticleTrafficChart({
  days,
}: ArticleTrafficChartProps) {
  const translate = useTranslations('pages.articles.traffic');
  const hasTraffic = days.some(
    (day) => day.views > 0 || day.resourceClicks > 0,
  );

  if (!hasTraffic) {
    return (
      <div className="relative h-60">
        <ChartEmptyState shape="line" title={translate('noTraffic')} />
      </div>
    );
  }

  return (
    <ChartContainer
      config={{
        views: { label: translate('chartViews'), color: 'var(--foreground)' },
        resourceClicks: {
          label: translate('resourceActions'),
          color: 'var(--accent-rose)',
        },
      }}
      height={240}
    >
      <LineChart data={days} accessibilityLayer margin={{ left: 0, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          minTickGap={30}
        />
        <YAxis allowDecimals={false} width={40} />
        <Tooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="views"
          type="monotone"
          stroke="var(--color-views)"
          dot={false}
        />
        <Line
          dataKey="resourceClicks"
          type="monotone"
          stroke="var(--color-resourceClicks)"
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
