'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import type {
  TrendTurnoverPlatformStats,
  TrendTurnoverResponse,
} from '@services/social/trends.service';
import { TrendsService } from '@services/social/trends.service';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Table from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import {
  Activity,
  Clock,
  Flame,
  Repeat,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const TrendFlowChart = dynamic(() => import('./TrendFlowChart'), {
  loading: () => <div className="h-72 w-full bg-muted/40 animate-pulse" />,
  ssr: false,
});

type TurnoverPeriod = 7 | 30 | 90;

const PERIOD_OPTIONS: Array<{ days: TurnoverPeriod; labelKey: string }> = [
  { days: 7, labelKey: 'd7' },
  { days: 30, labelKey: 'd30' },
  { days: 90, labelKey: 'd90' },
];

const LONGEST_PERIOD: TurnoverPeriod = 90;

function isTurnoverPeriod(value: number): value is TurnoverPeriod {
  return PERIOD_OPTIONS.some((option) => option.days === value);
}

export default function DiscoveryTrendTurnover() {
  const translate = useTranslations('pages.analytics.trendTurnover');
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const { href } = useOrgUrl();

  const [period, setPeriod] = useState<TurnoverPeriod>(30);
  const [data, setData] = useState<TrendTurnoverResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const service = await getTrendsService();
        const response = await service.getTurnoverStats(period);
        if (controller.signal.aborted) {
          return;
        }
        setData(response);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setData(null);
        setHasError(true);
        logger.error('Failed to fetch trend turnover data', { error });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [getTrendsService, period]);

  const totals = data?.totals;
  const hasTurnoverData = Boolean(
    totals &&
      (totals.appeared > 0 || totals.died > 0 || data?.byPlatform.length),
  );
  const isEmpty = !isLoading && !hasError && !hasTurnoverData;

  return (
    <Container
      label={translate('heading')}
      description={translate('description')}
      icon={Repeat}
      moduleChrome
      headerTabs={{
        activeTab: String(period),
        ariaLabel: translate('periodLabel'),
        fullWidth: false,
        onTabChange: (value) => {
          const days = Number(value);
          if (isTurnoverPeriod(days)) {
            setPeriod(days);
          }
        },
        tabs: PERIOD_OPTIONS.map((option) => ({
          id: String(option.days),
          label: translate(`periods.${option.labelKey}`),
        })),
      }}
      bodyClassName="space-y-8"
    >
      {hasError ? (
        <Alert type={AlertCategory.ERROR}>{translate('errors.load')}</Alert>
      ) : null}

      {isEmpty ? (
        <CardEmpty
          icon={Repeat}
          label={translate('emptyState.title')}
          description={translate('emptyState.description', { days: period })}
          actions={
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={href(APP_ROUTES.DISCOVERY.TRENDS)}>
                  <Activity className="size-3.5" />
                  {translate('emptyState.checkSourceHealth')}
                </Link>
              </Button>
              {period !== LONGEST_PERIOD ? (
                <Button
                  label={translate('emptyState.tryLongestPeriod')}
                  onClick={() => setPeriod(LONGEST_PERIOD)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                />
              ) : null}
            </div>
          }
        />
      ) : null}

      {!isEmpty && !hasError ? (
        <>
          <KPISection
            gridCols={{ desktop: 4, mobile: 1 }}
            className="bg-background"
            isLoading={isLoading}
            items={[
              {
                description: translate('kpi.appeared.description', {
                  days: period,
                }),
                icon: TrendingUp,
                label: translate('kpi.appeared.label'),
                value: totals?.appeared ?? 0,
              },
              {
                description: translate('kpi.died.description', {
                  days: period,
                }),
                icon: TrendingDown,
                label: translate('kpi.died.label'),
                value: totals?.died ?? 0,
              },
              {
                description: translate('kpi.avgLifespan.description'),
                icon: Clock,
                label: translate('kpi.avgLifespan.label'),
                value: totals
                  ? translate('lifespanDays', {
                      value: totals.avgLifespanDays.toFixed(1),
                    })
                  : ':',
              },
              {
                description: translate('kpi.turnoverRate.description'),
                icon: Flame,
                label: translate('kpi.turnoverRate.label'),
                value: totals ? `${totals.turnoverRate}%` : ':',
              },
            ]}
          />

          <Card
            className="backdrop-blur"
            bodyClassName="space-y-4"
            label={translate('flow.title')}
          >
            <Text size="sm" color="subtle-60">
              {translate('flow.description')}
            </Text>
            <TrendFlowChart data={data?.timeline ?? []} isLoading={isLoading} />
          </Card>

          <Card
            className="backdrop-blur"
            bodyClassName="space-y-4"
            label={translate('breakdown.title')}
          >
            <Table<TrendTurnoverPlatformStats>
              items={data?.byPlatform ?? []}
              isLoading={isLoading}
              getRowKey={(item) => item.platform}
              emptyLabel={translate('breakdown.empty')}
              columns={[
                {
                  header: translate('breakdown.columns.platform'),
                  key: 'platform',
                  render: (item) => {
                    const config = PLATFORM_CONFIGS[item.platform];
                    const Icon = config?.icon;
                    return (
                      <div className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className="size-4"
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
                  header: translate('breakdown.columns.appeared'),
                  key: 'appeared',
                  render: (item) => (
                    <span className="font-mono">{item.appeared}</span>
                  ),
                },
                {
                  className: 'text-right',
                  header: translate('breakdown.columns.died'),
                  key: 'died',
                  render: (item) => (
                    <span className="font-mono">{item.died}</span>
                  ),
                },
                {
                  className: 'text-right',
                  header: translate('breakdown.columns.alive'),
                  key: 'alive',
                  render: (item) => (
                    <span className="font-mono">{item.alive}</span>
                  ),
                },
                {
                  className: 'text-right',
                  header: translate('breakdown.columns.avgLifespan'),
                  key: 'avgLifespanDays',
                  render: (item) => (
                    <span className="font-mono">
                      {translate('lifespanDays', {
                        value: item.avgLifespanDays.toFixed(1),
                      })}
                    </span>
                  ),
                },
                {
                  className: 'text-right',
                  header: translate('breakdown.columns.turnoverRate'),
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
            className="backdrop-blur"
            bodyClassName="space-y-4"
            label={translate('volatility.title')}
          >
            <Text size="sm" color="subtle-60">
              {translate('volatility.description')}
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
                            className="size-3.5"
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
                    <div className="h-1.5 w-full bg-tertiary overflow-hidden">
                      <div
                        className="h-full bg-primary transition-[width] duration-500"
                        style={{ width: `${item.turnoverRate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!isLoading && !data?.byPlatform?.length && (
                <Text size="sm" color="subtle-60">
                  {translate('volatility.empty')}
                </Text>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </Container>
  );
}
