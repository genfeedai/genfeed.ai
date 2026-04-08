'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
import type { ICrmAnalytics } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AdminCrmService } from '@services/admin/crm.service';
import { logger } from '@services/core/logger.service';
import Container from '@ui/layout/container/Container';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { useMemo, useState } from 'react';
import { HiOutlineChartPie } from 'react-icons/hi2';

const ANALYTICS_SKELETON_KEYS = [
  'analytics-skeleton-1',
  'analytics-skeleton-2',
  'analytics-skeleton-3',
  'analytics-skeleton-4',
] as const;

const PERIOD_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const;

const FUNNEL_COLORS = [
  'bg-blue-500',
  'bg-sky-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-emerald-500',
  'bg-green-500',
  'bg-amber-500',
];

const SOURCE_COLORS = {
  event: 'bg-pink-500',
  inbound: 'bg-emerald-500',
  organic: 'bg-teal-500',
  outbound: 'bg-blue-500',
  paid: 'bg-amber-500',
  referral: 'bg-violet-500',
} as const;

// === CSS Bar Chart Component ===

function HorizontalBar({
  label,
  value,
  maxValue,
  barColor,
  suffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  barColor: string;
  suffix?: string;
}) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground/60 w-28 shrink-0 truncate capitalize">
        {label}
      </span>
      <div className="flex-1 h-6 bg-white/[0.03] rounded overflow-hidden relative">
        <div
          className={`h-full ${barColor} rounded transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-sm font-medium text-foreground/80 w-16 text-right">
        {value}
        {suffix}
      </span>
    </div>
  );
}

// === Velocity CSS Chart ===

function VelocityChart({ data }: { data: { date: string; count: number }[] }) {
  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  );

  if (data.length === 0) {
    return (
      <p className="text-sm text-foreground/40 text-center py-8">
        No velocity data
      </p>
    );
  }

  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d) => {
        const height = (d.count / maxCount) * 100;
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center justify-end gap-1"
          >
            <span className="text-[10px] text-foreground/50">{d.count}</span>
            <div
              className="w-full bg-primary/60 rounded-t-sm transition-all duration-500 min-h-[2px]"
              style={{ height: `${height}%` }}
            />
            <span className="text-[9px] text-foreground/30 truncate w-full text-center">
              {new Date(d.date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const getCrmService = useAuthedService((token: string) =>
    AdminCrmService.getInstance(token),
  );

  const {
    data: analytics,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<ICrmAnalytics>(
    async () => {
      const service = await getCrmService();
      return service.getAnalytics(days);
    },
    {
      dependencies: [days],
      onError: (error: Error) => {
        logger.error('GET /admin/crm/analytics failed', error);
      },
    },
  );

  const maxFunnelCount = useMemo(
    () =>
      analytics ? Math.max(...analytics.funnel.map((f) => f.count), 1) : 1,
    [analytics],
  );

  const maxSourceCount = useMemo(
    () =>
      analytics ? Math.max(...analytics.sources.map((s) => s.count), 1) : 1,
    [analytics],
  );

  const maxStageDays = useMemo(
    () =>
      analytics
        ? Math.max(...analytics.avgTimePerStage.map((s) => s.avgDays), 1)
        : 1,
    [analytics],
  );

  return (
    <Container
      label="Analytics"
      description="CRM performance metrics and pipeline analytics"
      icon={HiOutlineChartPie}
      right={
        <>
          <div className="flex items-center border border-white/[0.08] rounded overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  days === opt.value
                    ? 'bg-primary/20 text-primary'
                    : 'text-foreground/60 hover:text-foreground'
                }`}
                onClick={() => setDays(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <ButtonRefresh
            onClick={() => refresh()}
            isRefreshing={isRefreshing}
          />
        </>
      }
    >
      {isLoading || !analytics ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ANALYTICS_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="h-64 bg-white/5 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Conversion Funnel */}
          <WorkspaceSurface
            title="Conversion Funnel"
            tone="muted"
            data-testid="crm-analytics-funnel-surface"
          >
            <div className="space-y-3">
              {analytics.funnel.length === 0 ? (
                <p className="text-sm text-foreground/40 text-center py-4">
                  No funnel data
                </p>
              ) : (
                analytics.funnel.map((stage, i) => (
                  <div key={stage.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-foreground/70 capitalize">
                        {stage.stage}
                      </span>
                      <span className="text-xs text-foreground/50">
                        {stage.count} ({stage.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-5 bg-white/[0.03] rounded overflow-hidden">
                      <div
                        className={`h-full ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]} rounded transition-all duration-500`}
                        style={{
                          width: `${(stage.count / maxFunnelCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </WorkspaceSurface>

          {/* Lead Velocity */}
          <WorkspaceSurface
            title="Lead Velocity"
            tone="muted"
            data-testid="crm-analytics-velocity-surface"
          >
            {analytics.velocity.length === 0 ? (
              <p className="text-sm text-foreground/40 text-center py-8">
                No velocity data
              </p>
            ) : (
              <VelocityChart data={analytics.velocity} />
            )}
          </WorkspaceSurface>

          {/* Source Performance */}
          <WorkspaceSurface
            title="Source Performance"
            tone="muted"
            data-testid="crm-analytics-source-surface"
          >
            <div className="space-y-3">
              {analytics.sources.length === 0 ? (
                <p className="text-sm text-foreground/40 text-center py-4">
                  No source data
                </p>
              ) : (
                analytics.sources.map((source) => (
                  <HorizontalBar
                    key={source.source}
                    label={source.source}
                    value={source.count}
                    maxValue={maxSourceCount}
                    barColor={
                      SOURCE_COLORS[
                        source.source as keyof typeof SOURCE_COLORS
                      ] ?? 'bg-slate-500'
                    }
                  />
                ))
              )}
            </div>
          </WorkspaceSurface>

          {/* Avg Time per Stage */}
          <WorkspaceSurface
            title="Avg Time per Stage"
            tone="muted"
            data-testid="crm-analytics-stage-surface"
          >
            <div className="space-y-3">
              {analytics.avgTimePerStage.length === 0 ? (
                <p className="text-sm text-foreground/40 text-center py-4">
                  No stage data
                </p>
              ) : (
                analytics.avgTimePerStage.map((stage) => (
                  <HorizontalBar
                    key={stage.stage}
                    label={stage.stage}
                    value={Number(stage.avgDays.toFixed(1))}
                    maxValue={maxStageDays}
                    barColor="bg-primary"
                    suffix="d"
                  />
                ))
              )}
            </div>
          </WorkspaceSurface>
        </div>
      )}
    </Container>
  );
}
