'use client';

import type { IOrganizationCreditUsage } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { SubscriptionsService } from '@services/billing/subscriptions.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Progress } from '@ui/primitives/progress';
import { useEffect } from 'react';
import { HiOutlineChartBar } from 'react-icons/hi2';

export default function CreditUsageList() {
  const getSubscriptionsService = useAuthedService((token: string) =>
    SubscriptionsService.getInstance(token),
  );

  const {
    data: creditUsageResponse,
    isLoading,
    isFetching,
    error: creditUsageError,
    refetch,
  } = useQuery({
    queryKey: ['admin-credit-usage'],
    queryFn: async () => {
      const service = await getSubscriptionsService();
      return service.getCreditUsage();
    },
  });

  const isRefreshing = isFetching && !isLoading;
  const creditUsage = creditUsageResponse?.data || [];

  useEffect(() => {
    if (creditUsageError) {
      logger.error(
        'GET /subscriptions/admin/credit-usage failed',
        creditUsageError,
      );
    }
  }, [creditUsageError]);

  const refresh = () => {
    refetch();
  };

  const columns: TableColumn<IOrganizationCreditUsage>[] = [
    {
      header: 'Organization',
      key: 'organizationName',
      render: (row: IOrganizationCreditUsage) => row.organizationName,
    },
    {
      header: 'Tier',
      key: 'tier',
      render: (row: IOrganizationCreditUsage) =>
        row.tier ? (
          <Badge variant="outline" className="uppercase">
            {row.tier}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (row: IOrganizationCreditUsage) =>
        row.status ? <Badge status={row.status} /> : '—',
    },
    {
      header: 'Balance',
      key: 'balance',
      render: (row: IOrganizationCreditUsage) => row.balance.toLocaleString(),
    },
    {
      header: 'Allotment',
      key: 'planLimit',
      render: (row: IOrganizationCreditUsage) => row.planLimit.toLocaleString(),
    },
    {
      header: 'Used',
      key: 'usedPercent',
      render: (row: IOrganizationCreditUsage) => (
        <div className="flex items-center gap-2">
          <Progress value={row.usedPercent} className="w-24" />
          <span className="text-muted-foreground text-sm">
            {Math.round(row.usedPercent)}%
          </span>
        </div>
      ),
    },
    {
      header: 'Flag',
      key: 'isMaxedOut',
      render: (row: IOrganizationCreditUsage) => {
        if (row.isMaxedOut) {
          return <Badge variant="destructive">Maxed out</Badge>;
        }

        if (row.isUnderUsing) {
          return <Badge variant="outline">Under-using</Badge>;
        }

        return '—';
      },
    },
  ];

  return (
    <Container
      label="Credit Usage"
      description="Monitor per-organization credit balance and plan allotment usage"
      icon={HiOutlineChartBar}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <AppTable<IOrganizationCreditUsage>
        items={creditUsage}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(row) => row.organizationId}
        emptyLabel="No organization credit usage found"
      />
    </Container>
  );
}
