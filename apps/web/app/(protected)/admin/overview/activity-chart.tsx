'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import Spinner from '@ui/primitives/spinner';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type { ActivityChartProps } from '@/features/admin/props/dashboard.props';

const Area = dynamic(() => import('recharts').then((module) => module.Area), {
  ssr: false,
});
const AreaChart = dynamic(
  () => import('recharts').then((module) => module.AreaChart),
  { ssr: false },
);
const ResponsiveContainer = dynamic(
  () => import('recharts').then((module) => module.ResponsiveContainer),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import('recharts').then((module) => module.Tooltip),
  { ssr: false },
);
const XAxis = dynamic(() => import('recharts').then((module) => module.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((module) => module.YAxis), {
  ssr: false,
});

const _dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

const _compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
});

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return _dateFormatter.format(date);
}

export default function ActivityChart({ data, isLoading }: ActivityChartProps) {
  const selectionLabels = useTranslations('ui.selectionGroups');
  const [range, setRange] = useState<'7d' | '30d'>('7d');

  return (
    <WorkspaceSurface
      eyebrow="Performance Trend"
      title="Platform Activity"
      tone="muted"
      data-testid="activity-chart"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-foreground/60">
          Real-time throughput metrics
        </div>
        <SegmentedControl
          ariaLabel={selectionLabels('activityRange')}
          onValueChange={setRange}
          options={[
            { label: '7 Days', value: '7d' },
            { label: '30 Days', value: '30d' },
          ]}
          size="sm"
          value={range}
        />
      </div>
      <div className="h-chart-sm">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner aria-hidden="true" size={ComponentSize.SM} />
              Loading chart…
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ bottom: 0, left: 0, right: 10, top: 10 }}
            >
              <defs>
                <linearGradient id="colorPosts" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--foreground))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--foreground))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => _compactNumberFormatter.format(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}
                labelStyle={{
                  color: 'hsl(var(--foreground))',
                  fontWeight: '600',
                  marginBottom: '8px',
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                labelFormatter={(label) => formatDate(String(label))}
              />
              <Area
                type="monotone"
                dataKey="posts"
                name="Activity"
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPosts)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </WorkspaceSurface>
  );
}
