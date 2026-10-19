'use client';

import { LazyModalSubscription } from '@components/lazy/lazy-modal.admin';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  formatCreditBalanceExact,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IOrganizationBilling } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { SubscriptionsService } from '@services/billing/subscriptions.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Copy, CreditCard, Pencil, ShieldAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import CreditHoldsPanel from './credit-holds-panel';

const EMPTY_CELL = '-';

function getOrganizationHref(row: IOrganizationBilling): string {
  return `${APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS}/${row.organizationId}`;
}

export default function SubscriptionsList() {
  const t = useTranslations('pages.adminCreditHolds');
  const rowSidebarT = useTranslations('ui.rowSidebar');
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const subscriptionT = useTranslations('ui.rowSidebar.subscription');
  const getSubscriptionsService = useAuthedService((token: string) =>
    SubscriptionsService.getInstance(token),
  );

  const clipboardService = ClipboardService.getInstance();
  const currentPage = Number(useSearchParams().get('page')) || 1;

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [holdsOrganization, setHoldsOrganization] =
    useState<IOrganizationBilling>();

  const {
    data: billing,
    isLoading,
    isFetching,
    error: billingError,
    refetch,
  } = useQuery({
    queryKey: ['admin-subscriptions', currentPage],
    queryFn: async () => {
      const service = await getSubscriptionsService();
      return service.getAdminBilling({
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      });
    },
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (billingError) {
      logger.error('GET /subscriptions/admin/billing failed', billingError);
    }
  }, [billingError]);

  const refresh = () => {
    refetch();
  };

  const openSubscriptionModal = (organizationId: string) => {
    setSelectedOrgId(organizationId);
    openModal(ModalEnum.SUBSCRIPTION);
  };

  const handleCopy = async (customerId: string) =>
    await clipboardService.copyToClipboard(customerId);

  const columns: TableColumn<IOrganizationBilling>[] = [
    {
      header: t('columnOrganization'),
      key: 'organizationName',
      render: (row: IOrganizationBilling) => row.organizationName,
    },
    {
      header: t('columnOwner'),
      key: 'ownerEmail',
      render: (row: IOrganizationBilling) => row.ownerEmail ?? EMPTY_CELL,
    },
    {
      header: t('columnPlan'),
      key: 'tier',
      render: (row: IOrganizationBilling) =>
        row.tier ? (
          <Badge variant="outline" className="uppercase">
            {row.tier}
          </Badge>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      header: t('columnStatus'),
      key: 'status',
      render: (row: IOrganizationBilling) =>
        row.status ? <Badge status={row.status} /> : EMPTY_CELL,
    },
    {
      header: t('columnBalance'),
      key: 'balance',
      render: (row: IOrganizationBilling) =>
        formatCreditBalanceExact(row.balance),
    },
    {
      header: t('columnUsed'),
      key: 'usedPercent',
      render: (row: IOrganizationBilling) =>
        row.planLimit > 0 ? (
          <div className="flex items-center gap-2">
            <Progress value={row.usedPercent} className="w-24" />
            <span className="text-muted-foreground text-sm">
              {Math.round(row.usedPercent)}%
            </span>
          </div>
        ) : (
          EMPTY_CELL
        ),
    },
    {
      header: t('columnFlag'),
      key: 'isMaxedOut',
      render: (row: IOrganizationBilling) => {
        if (row.isMaxedOut) {
          return <Badge variant="destructive">{t('flagMaxedOut')}</Badge>;
        }

        if (row.isUnderUsing) {
          return <Badge variant="outline">{t('flagUnderUsing')}</Badge>;
        }

        return EMPTY_CELL;
      },
    },
    {
      header: t('columnCustomerId'),
      key: 'stripeCustomerId',
      render: (row: IOrganizationBilling) => {
        const customerId = row.stripeCustomerId;
        if (!customerId) {
          return EMPTY_CELL;
        }

        return (
          <Button
            variant={ButtonVariant.SECONDARY}
            tooltip={t('copyCustomerId')}
            tooltipPosition="right"
            onClick={() => handleCopy(customerId)}
            label={
              <span className="flex items-center gap-2">
                <Copy />
                {customerId}
              </span>
            }
          />
        );
      },
    },
    {
      header: t('columnPeriodEnd'),
      key: 'currentPeriodEnd',
      render: (row: IOrganizationBilling) =>
        row.currentPeriodEnd
          ? new Date(row.currentPeriodEnd).toLocaleDateString('en-US')
          : EMPTY_CELL,
    },
  ];

  const actions: TableAction<IOrganizationBilling>[] = [
    {
      href: (row: IOrganizationBilling) =>
        row.stripeCustomerId
          ? `https://dashboard.stripe.com/customers/${row.stripeCustomerId}`
          : undefined,
      icon: <CreditCard />,
      isExternal: true,
      size: ButtonSize.SM,
      tooltip: t('openStripe'),
      variant: ButtonVariant.SECONDARY,
    },
    {
      icon: <ShieldAlert />,
      onClick: (row: IOrganizationBilling) => setHoldsOrganization(row),
      size: ButtonSize.SM,
      tooltip: t('reviewHolds'),
      variant: ButtonVariant.SECONDARY,
    },
    {
      icon: <Pencil />,
      onClick: (row: IOrganizationBilling) =>
        openSubscriptionModal(row.organizationId),
      size: ButtonSize.SM,
      tooltip: t('editSubscription'),
      tooltipPosition: 'left',
      variant: ButtonVariant.DEFAULT,
    },
  ];

  const rowSidebar = createSummaryRowSidebar<IOrganizationBilling>({
    getBadges: (row) => (
      <>
        {row.tier ? (
          <Badge variant="outline" className="uppercase">
            {row.tier}
          </Badge>
        ) : null}
        {row.status ? <Badge status={row.status} /> : null}
      </>
    ),
    getFacts: (row) => [
      { id: 'owner', label: subscriptionT('owner'), value: row.ownerEmail },
      {
        id: 'customer',
        label: subscriptionT('customerId'),
        value: row.stripeCustomerId,
      },
      {
        id: 'balance',
        label: fieldsT('balance'),
        value: formatCreditBalanceExact(row.balance),
      },
      {
        id: 'usage',
        label: subscriptionT('usage'),
        value:
          row.planLimit > 0 ? `${Math.round(row.usedPercent)}%` : undefined,
      },
      {
        id: 'periodEnd',
        label: subscriptionT('periodEnd'),
        value: row.currentPeriodEnd
          ? new Date(row.currentPeriodEnd).toLocaleDateString('en-US')
          : undefined,
      },
    ],
    getId: (row) => row.organizationId,
    getOpenHref: getOrganizationHref,
    getSubtitle: (row) => row.ownerEmail ?? undefined,
    getTitle: (row) => row.organizationName || rowSidebarT('notAvailable'),
    kind: 'record',
    onEdit: (row) => openSubscriptionModal(row.organizationId),
    openLabel: subscriptionT('openOrganization'),
  });

  return (
    <AdminPageShell
      title={t('subscriptionsTitle')}
      icon={CreditCard}
      onRefresh={() => refresh()}
      isRefreshing={isRefreshing}
    >
      <AppTable<IOrganizationBilling>
        items={billing?.data ?? []}
        isLoading={isLoading}
        columns={columns}
        actions={actions}
        getRowKey={(row) => row.organizationId}
        getRowLink={(row) => ({
          href: getOrganizationHref(row),
          label: rowSidebarT('openNamed', { name: row.organizationName }),
        })}
        rowSidebar={rowSidebar}
        emptyLabel={t('subscriptionsEmpty')}
      />

      <div className="mt-4">
        <AutoPagination showTotal totalLabel={t('subscriptionsTotalLabel')} />
      </div>

      {holdsOrganization && (
        <CreditHoldsPanel
          key={holdsOrganization.organizationId}
          organizationId={holdsOrganization.organizationId}
          organizationName={holdsOrganization.organizationName}
        />
      )}

      <LazyModalSubscription
        organizationId={selectedOrgId}
        onConfirm={() => refresh()}
      />
    </AdminPageShell>
  );
}
