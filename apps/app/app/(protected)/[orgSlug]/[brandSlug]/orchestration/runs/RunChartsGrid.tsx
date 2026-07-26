'use client';

import type { AgentExecutionStatus } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import type { AgentRunStats, AgentRunTrendPoint } from '@genfeedai/types';
import Card from '@ui/card/Card';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const Bar = dynamic(() => import('recharts').then((module) => module.Bar), {
  ssr: false,
});
const BarChart = dynamic(
  () => import('recharts').then((module) => module.BarChart),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import('recharts').then((module) => module.CartesianGrid),
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

const CHART_COLORS = {
  amber: '#fbbf24',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  emerald: '#34d399',
  rose: '#fb7185',
};

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '12px',
  color: 'hsl(var(--foreground))',
  fontSize: '12px',
};

function formatStatusLabel(status: AgentExecutionStatus): string {
  const normalized = status.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

interface MiniChartCardProps {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}

function MiniChartCard({ children, subtitle, title }: MiniChartCardProps) {
  return (
    <Card bodyClassName="p-4">
      <div className="mb-2 space-y-0.5">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        <p className="text-[10px] uppercase tracking-wider text-foreground/40">
          {subtitle}
        </p>
      </div>
      <div className="h-[120px]">{children}</div>
    </Card>
  );
}

function EmptyChartPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center rounded-card bg-background text-xs text-foreground/32 shadow-border">
      No data for this period
    </div>
  );
}

function RunActivityChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => ({
        date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
        runs: point.totalRuns,
      })),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="runs" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RunsByStatusChart({ runs }: { runs: IAgentRun[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const run of runs) {
      const status = formatStatusLabel(run.status);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [runs]);

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={CHART_COLORS.cyan} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CreditsByDayChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => ({
        credits: Number(point.totalCreditsUsed.toFixed(2)),
        date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
      })),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar
          dataKey="credits"
          fill={CHART_COLORS.amber}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SuccessRateChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => {
        const autoRoutedRate = Math.round(point.autoRoutedRate * 100);
        return {
          date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
          rate: autoRoutedRate > 100 ? 100 : autoRoutedRate,
        };
      }),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value: unknown) => [`${String(value ?? 0)}%`, 'Rate']}
        />
        <Bar dataKey="rate" fill={CHART_COLORS.emerald} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Dense run charts for the operations module. These moved out of the workspace
 * overview: that surface renders inside the conversation canvas and is capped
 * at a centered 3/6/9 card grid, so a four-chart back-office grid never had a
 * home there. `RunTrendsPanel` covers routing rates only — activity, status
 * mix, credit burn, and success rate are this grid's job.
 */
export default function RunChartsGrid({
  runs,
  stats,
}: {
  runs: IAgentRun[];
  stats: AgentRunStats | null;
}) {
  const trends = stats?.trends ?? [];

  if (trends.length === 0 && runs.length === 0) {
    return null;
  }

  return (
    <section data-testid="run-charts">
      <DashboardGrid>
        <MiniChartCard title="Run Activity" subtitle="Last 14 days">
          <RunActivityChart trends={trends} />
        </MiniChartCard>
        <MiniChartCard title="Runs by Status" subtitle="Current filtered page">
          <RunsByStatusChart runs={runs} />
        </MiniChartCard>
        <MiniChartCard title="Credits by Day" subtitle="Last 14 days">
          <CreditsByDayChart trends={trends} />
        </MiniChartCard>
        <MiniChartCard title="Success Rate" subtitle="Last 14 days">
          <SuccessRateChart trends={trends} />
        </MiniChartCard>
      </DashboardGrid>
    </section>
  );
}
