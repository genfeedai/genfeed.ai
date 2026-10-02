'use client';

import type { ArticleTrafficChartProps } from '@props/content/article-traffic.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function ArticleTrafficChart({
  days,
}: ArticleTrafficChartProps) {
  const translate = useTranslations('pages.articles.traffic');
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
