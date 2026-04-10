'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import type {
  TrendTurnoverPlatformStats,
  TrendTurnoverResponse,
} from '@services/social/trends.service';
import { TrendsService } from '@services/social/trends.service';
import Card from '@ui/card/Card';
import Table from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
  HiOutlineClock,
  HiOutlineFire,
} from 'react-icons/hi2';

const TrendFlowChart = dynamic(() => import('./TrendFlowChart'), {
  loading: () => <div className="h-72 w-full bg-muted/40 animate-pulse" />,
  ssr: false,
});

const PERIOD_OPTIONS = [
  { days: 7 as const, label: '7D' },
  { days: 30 as const, label: '30D' },
  { days: 90 as const, label: '90D' },
];

export default function AnalyticsTrendTurnover() {
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<TrendTurnoverResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const service = await getTrendsService();
        const response = await service.getTurnoverStats(period);
        setData(response);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch trend turnover data', { error });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [getTrendsService, period]);

  const totals = data?.totals;

  return (
    <div className="space-y-8 pb-12">
      <header>
        <VStack gap={3}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.days}
                  withWrapper={false}
                  size={ButtonSize.XS}
                  variant={
                    period === opt.days
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.GHOST
                  }
                  onClick={() => setPeriod(opt.days)}
                  className="uppercase tracking-wide"
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          <Heading size="2xl" as="h1">
            Trend Turnover Dashboard
          </Heading>
          <Text as="p" color="subtle-70" className="max-w-3xl">
            How quickly trends appear and die on each platform over the last{' '}
            {period} days — higher turnover means faster-moving content cycles.
          </Text>
        </VStack>
      </header>

      <KPISection
        gridCols={{ desktop: 4, mobile: 1, tablet: 2 }}
        className="bg-background"
        isLoading={isLoading}
        items={[
          {
            description: `New trends in the last ${period} days`,
            icon: HiOutlineArrowTrendingUp,
            label: 'Appeared',
            value: totals?.appeared ?? 0,
          },
          {
            description: `Trends that expired in the last ${period} days`,
            icon: HiOutlineArrowTrendingDown,
            label: 'Died',
            value: totals?.died ?? 0,
          },
          {
            description: 'Average time a trend stays active',
            icon: HiOutlineClock,
            label: 'Avg Lifespan',
            value: totals ? `${totals.avgLifespanDays.toFixed(1)}d` : '—',
          },
          {
            description: 'Percentage of new trends that expired',
            icon: HiOutlineFire,
            label: 'Turnover Rate',
            value: totals ? `${totals.turnoverRate}%` : '—',
          },
        ]}
      />

      <Card
        className="border border-white/[0.08] bg-card/80 backdrop-blur"
        bodyClassName="space-y-4"
        label="Trend Flow"
      >
        <Text size="sm" color="subtle-60">
          Daily trend births (green) vs. deaths (red) over the selected period.
        </Text>
        <TrendFlowChart data={data?.timeline ?? []} isLoading={isLoading} />
      </Card>

      <Card
        className="border border-white/[0.08] bg-card/80 backdrop-blur"
        bodyClassName="space-y-4"
        label="Platform Breakdown"
      >
        <Table<TrendTurnoverPlatformStats>
          items={data?.byPlatform ?? []}
          isLoading={isLoading}
          getRowKey={(item) => item.platform}
          emptyLabel="No trend data for this period"
          columns={[
            {
              header: 'Platform',
              key: 'platform',
              render: (item) => {
                const config = PLATFORM_CONFIGS[item.platform];
                const Icon = config?.icon;
                return (
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="h-4 w-4"
                        style={{ color: config?.color }}
                      />
                    )}
                    <span className="font-medium capitalize">
                      {config?.label ?? item.platform}
                    </span>
                  </div>
                );
              },
            },
            {
              className: 'text-right',
              header: 'Appeared',
              key: 'appeared',
              render: (item) => (
                <span className="font-mono">{item.appeared}</span>
              ),
            },
            {
              className: 'text-right',
              header: 'Died',
              key: 'died',
              render: (item) => <span className="font-mono">{item.died}</span>,
            },
            {
              className: 'text-right',
              header: 'Alive',
              key: 'alive',
              render: (item) => <span className="font-mono">{item.alive}</span>,
            },
            {
              className: 'text-right',
              header: 'Avg Lifespan',
              key: 'avgLifespanDays',
              render: (item) => (
                <span className="font-mono">
                  {item.avgLifespanDays.toFixed(1)}d
                </span>
              ),
            },
            {
              className: 'text-right',
              header: 'Turnover Rate',
              key: 'turnoverRate',
              render: (item) => (
                <span
                  className={`font-mono font-semibold ${item.turnoverRate >= 70 ? 'text-error' : item.turnoverRate >= 40 ? 'text-warning' : 'text-success'}`}
                >
                  {item.turnoverRate}%
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Card
        className="border border-white/[0.08] bg-card/80 backdrop-blur"
        bodyClassName="space-y-4"
        label="Platform Volatility"
      >
        <Text size="sm" color="subtle-60">
          Turnover rate by platform — higher bars indicate faster trend churn.
        </Text>
        <div className="space-y-3">
          {(data?.byPlatform ?? []).map((item) => {
            const config = PLATFORM_CONFIGS[item.platform];
            const Icon = config?.icon;
            return (
              <div key={item.platform} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {Icon && (
                      <Icon
                        className="h-3.5 w-3.5"
                        style={{ color: config?.color }}
                      />
                    )}
                    <span className="font-medium capitalize">
                      {config?.label ?? item.platform}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-foreground/60">
                    {item.turnoverRate}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${item.turnoverRate}%` }}
                  />
                </div>
              </div>
            );
          })}
          {!isLoading && !data?.byPlatform?.length && (
            <Text size="sm" color="subtle-60">
              No platform data available for this period.
            </Text>
          )}
        </div>
      </Card>
    </div>
  );
}
