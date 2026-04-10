'use client';

import type { TrendTimelineEntry } from '@services/social/trends.service';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendFlowChartProps {
  data: TrendTimelineEntry[];
  isLoading?: boolean;
}

export default function TrendFlowChart({
  data,
  isLoading,
}: TrendFlowChartProps) {
  if (isLoading) {
    return <div className="h-72 w-full bg-muted/40 animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-foreground/40">
        No timeline data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={288}>
      <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 16, top: 4 }}>
        <defs>
          <linearGradient id="appeared" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="hsl(var(--success))"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="hsl(var(--success))"
              stopOpacity={0}
            />
          </linearGradient>
          <linearGradient id="died" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--error))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--error))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 0,
            fontSize: 12,
          }}
          labelStyle={{ color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="appeared"
          name="Appeared"
          stroke="hsl(var(--success))"
          strokeWidth={1.5}
          fill="url(#appeared)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="died"
          name="Died"
          stroke="hsl(var(--error))"
          strokeWidth={1.5}
          fill="url(#died)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
