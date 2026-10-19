'use client';

import {
  formatCreditBalanceExact,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IOrganizationCreditUsage } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { SubscriptionsService } from '@services/billing/subscriptions.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Progress } from '@ui/primitives/progress';
import { ChartColumn, ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import CreditHoldsPanel from './credit-holds-panel';

export default function CreditUsageList() {
  const t = useTranslations('pages.adminCreditHolds');
  const [selectedOrganization, setSelectedOrganization] =
    useState<IOrganizationCreditUsage>();
  const currentPage = Number(useSearchParams().get('page')) || 1;
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
    queryKey: ['admin-credit-usage', currentPage],
    queryFn: async ({ signal }) => {
      const service = await getSubscriptionsService();
      return service.getCreditUsage(
        { limit: ITEMS_PER_PAGE, page: currentPage },
        signal,
      );
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
      render: (row: IOrganizationCreditUsage) =>
        formatCreditBalanceExact(row.balance),
    },
    {
      header: 'Allotment',
      key: 'planLimit',
      render: (row: IOrganizationCreditUsage) =>
        formatCreditBalanceExact(row.planLimit),
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

  const actions: TableAction<IOrganizationCreditUsage>[] = [
    {
      icon: <ShieldAlert />,
      onClick: (row) => setSelectedOrganization(row),
      tooltip: t('reviewHolds'),
    },
  ];

  return (
    <AdminPageShell
      title="Credit Usage"
      icon={ChartColumn}
      onRefresh={() => refresh()}
      isRefreshing={isRefreshing}
    >
      <AppTable<IOrganizationCreditUsage>
        items={creditUsage}
        isLoading={isLoading}
        actions={actions}
        columns={columns}
        getRowKey={(row) => row.organizationId}
        emptyLabel="No organization credit usage found"
      />
      <div className="mt-4">
        <AutoPagination showTotal totalLabel="organizations" />
      </div>
      {selectedOrganization && (
        <CreditHoldsPanel
          key={selectedOrganization.organizationId}
          organizationId={selectedOrganization.organizationId}
          organizationName={selectedOrganization.organizationName}
        />
      )}
    </AdminPageShell>
  );
}
