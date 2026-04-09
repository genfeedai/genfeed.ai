'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

interface ActivityChartProps {
  data: { date: string; posts: number }[];
  isLoading: boolean;
}

export default function ActivityChart({ data, isLoading }: ActivityChartProps) {
  return (
    <WorkspaceSurface
      eyebrow="Performance Trend"
      title="Platform Activity"
      tone="muted"
      data-testid="activity-chart"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-foreground/55">
          Real-time throughput metrics
        </div>
        <div className="flex bg-white/5 rounded-full p-1">
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="px-4 py-2 text-xs font-medium rounded-full bg-white/10 text-white"
          >
            7 Days
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="px-4 py-2 text-xs font-medium rounded-full text-white/50 hover:text-white/70 transition-colors"
          >
            30 Days
          </Button>
        </div>
      </div>
      <div className="h-chart-sm">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              Loading chart...
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
                tickFormatter={(value) =>
                  new Intl.NumberFormat('en-US', {
                    notation: 'compact',
                  }).format(value)
                }
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
                labelFormatter={(label) => formatDate(label)}
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
