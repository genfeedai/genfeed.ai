'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { CardGap, CardPadding } from '@genfeedai/contracts';
import type {
  ICreatorEarningsByArticle,
  ICreatorPaymentRow,
} from '@genfeedai/contracts/interfaces/billing';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { CreatorPaymentsService } from '@services/billing/creator-payments.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/dashboard/MetricCardGrid';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { HandCoins, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect } from 'react';
import MySubscriptionsCard from './my-subscriptions-card';
import SubscriptionPlansCard from './subscription-plans-card';

const NO_PAYMENTS: ICreatorPaymentRow[] = [];

/**
 * Earnings (#9719): what readers paid this organization's creators, by
 * source and article, and what the organization paid other creators. Every
 * number is read from the credit transfer ledger rows.
 */
export default function SettingsEarningsPage() {
  const translate = useTranslations('pages.creatorEarnings');
  const { organizationId } = useBrand();
  const { sessionId, userId } = useAuthIdentity();
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    enabled: Boolean(userId && organizationId),
    queryFn: async ({ signal }) => (await getService()).getEarnings(signal),
    queryKey: ['creator-earnings', userId, sessionId, organizationId],
    staleTime: 30_000,
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /creator-payments/earnings failed', error);
    }
  }, [error]);

  const credits = (amount: number) =>
    translate('credits', { amount: Math.round(amount) });

  const receivedColumns: TableColumn<ICreatorPaymentRow>[] = [
    {
      header: translate('columns.date'),
      key: 'createdAt',
      render: (row) => <TableDateCell value={row.createdAt} />,
    },
    {
      header: translate('columns.payment'),
      key: 'description',
      subtext: (row) => row.message ?? null,
    },
    {
      header: translate('columns.gross'),
      key: 'grossAmount',
      render: (row) => credits(row.grossAmount),
    },
    {
      header: translate('columns.fee'),
      key: 'feeAmount',
      render: (row) => credits(row.feeAmount),
    },
    {
      header: translate('columns.net'),
      key: 'netAmount',
      render: (row) => credits(row.netAmount),
    },
  ];

  const sentColumns: TableColumn<ICreatorPaymentRow>[] = [
    {
      header: translate('columns.date'),
      key: 'createdAt',
      render: (row) => <TableDateCell value={row.createdAt} />,
    },
    {
      header: translate('columns.payment'),
      key: 'description',
      subtext: (row) => row.message ?? null,
    },
    {
      header: translate('columns.amount'),
      key: 'grossAmount',
      render: (row) => credits(row.grossAmount),
    },
  ];

  const articleColumns: TableColumn<ICreatorEarningsByArticle>[] = [
    { header: translate('columns.article'), key: 'label' },
    {
      header: translate('columns.count'),
      key: 'count',
      render: (row) => row.count.toLocaleString('en-US'),
    },
    {
      header: translate('columns.net'),
      key: 'netAmount',
      render: (row) => credits(row.netAmount),
    },
  ];

  if (error) {
    return (
      <div className="flex flex-col gap-4 pb-10">
        <h1 className="sr-only">{translate('title')}</h1>
        <Card label={translate('title')} gap={CardGap.LG}>
          <Alert
            variant="destructive"
            icon={<TriangleAlert className="size-4" aria-hidden="true" />}
          >
            <AlertTitle>{translate('loadErrorTitle')}</AlertTitle>
            <AlertDescription>
              <p>{translate('loadErrorDescription')}</p>
              <Button
                className="mt-3"
                isDisabled={isFetching}
                onClick={() => void refetch()}
                withWrapper={false}
              >
                {translate('retry')}
              </Button>
            </AlertDescription>
          </Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      <Card
        label={translate('title')}
        padding={CardPadding.LG}
        gap={CardGap.LG}
      >
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HandCoins className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Text as="p" size="lg" weight="semibold">
              {translate('headline')}
            </Text>
            <Text as="p" size="sm" color="muted" className="max-w-2xl">
              {translate('description')}
            </Text>
          </div>
        </div>

        <MetricCardGrid className="border-t border-border pt-4" columns={3}>
          <MetricCard
            appearance="inset"
            isLoading={isLoading}
            label={translate('stats.earnedBalance')}
            size="sm"
            value={credits(data?.earnedBalance ?? 0)}
          />
          <MetricCard
            appearance="inset"
            isLoading={isLoading}
            label={translate('stats.thisMonth')}
            size="sm"
            value={credits(data?.thisMonth ?? 0)}
          />
          <MetricCard
            appearance="inset"
            isLoading={isLoading}
            label={translate('stats.totalEarned')}
            size="sm"
            value={credits(data?.totalEarned ?? 0)}
          />
        </MetricCardGrid>
      </Card>

      <SubscriptionPlansCard />

      <Card label={translate('bySourceTitle')} padding={CardPadding.LG}>
        <MetricCardGrid columns={3}>
          {(data?.bySource ?? []).map((source) => (
            <MetricCard
              key={source.kind}
              appearance="inset"
              label={translate('sourceLabel', {
                count: source.count,
                kind: translate(`kind.${source.kind}`),
              })}
              size="sm"
              value={credits(source.netAmount)}
            />
          ))}
        </MetricCardGrid>
      </Card>

      {data?.byArticle.length ? (
        <Card label={translate('byArticleTitle')} padding={CardPadding.NONE}>
          <AppTable<ICreatorEarningsByArticle>
            columns={articleColumns}
            getRowKey={(row) => row.articleId}
            items={data.byArticle}
          />
        </Card>
      ) : null}

      <Card label={translate('receivedTitle')} padding={CardPadding.NONE}>
        <AppTable<ICreatorPaymentRow>
          columns={receivedColumns}
          emptyLabel={translate('receivedEmpty')}
          getRowKey={(row) => row.transferId}
          isLoading={isLoading}
          items={data?.received ?? NO_PAYMENTS}
        />
      </Card>

      <MySubscriptionsCard />

      <Card label={translate('sentTitle')} padding={CardPadding.NONE}>
        <AppTable<ICreatorPaymentRow>
          columns={sentColumns}
          emptyLabel={translate('sentEmpty')}
          getRowKey={(row) => row.transferId}
          isLoading={isLoading}
          items={data?.sent ?? NO_PAYMENTS}
        />
      </Card>
    </div>
  );
}
