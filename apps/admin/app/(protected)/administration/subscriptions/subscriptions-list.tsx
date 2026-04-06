'use client';

import Button from '@components/buttons/base/Button';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { LazyModalSubscription } from '@components/lazy/LazyModal';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import type { IUser } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { Subscription } from '@models/billing/subscription.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { SubscriptionsService } from '@services/billing/subscriptions.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiDocumentDuplicate,
  HiOutlineCreditCard,
  HiPencil,
} from 'react-icons/hi2';

export default function SubscriptionsList() {
  const getSubscriptionsService = useAuthedService((token: string) =>
    SubscriptionsService.getInstance(token),
  );

  const clipboardService = ClipboardService.getInstance();

  const [selectedOrgId, setSelectedOrg] = useState<string | null>(null);

  const {
    data: subscriptions,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<Subscription[]>(
    async () => {
      const service = await getSubscriptionsService();
      return service.findAll();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /subscriptions failed', error);
      },
    },
  );

  const columns: TableColumn<Subscription>[] = [
    {
      header: 'Organization',
      key: 'organization',
      render: (subscription: Subscription) =>
        subscription?.organization?.label || 'N/A',
    },
    {
      header: 'User',
      key: 'user',
      render: (subscription: Subscription) => subscription.user?.email || 'N/A',
    },
    {
      header: 'Category',
      key: 'category',
      render: (subscription: Subscription) => (
        <Badge variant="outline" className="uppercase">
          {subscription.category}
        </Badge>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (subscription: Subscription) => (
        <Badge status={subscription.status} />
      ),
    },
    {
      header: 'Customer ID',
      key: 'stripeSubscriptionId',
      render: (subscription: Subscription) => (
        <Button
          variant={ButtonVariant.SECONDARY}
          tooltip="Copy Customer ID"
          tooltipPosition="right"
          onClick={() => handleCopy(subscription.stripeCustomerId)}
          label={
            <span className="flex items-center gap-2">
              <HiDocumentDuplicate />
              {subscription.stripeCustomerId}
            </span>
          }
        />
      ),
    },
    {
      header: 'Balance',
      key: 'balance',
      render: (subscription: Subscription) =>
        subscription?.organization.balance ?? 0,
    },

    {
      header: 'Period End',
      key: 'currentPeriodEnd',
      render: (subscription: Subscription) =>
        subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
          : 'N/A',
    },
  ];

  const openSubscriptionModal = (orgId: string) => {
    setSelectedOrg(orgId);
    openModal(ModalEnum.SUBSCRIPTION);
  };

  const handleCopy = async (customerId: string) =>
    await clipboardService.copyToClipboard(customerId);

  return (
    <Container
      label="Subscriptions"
      description="View subscription plans, billing history, and payment status"
      icon={HiOutlineCreditCard}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      <AppTable<Subscription>
        items={subscriptions || []}
        isLoading={isLoading}
        columns={columns}
        getRowKey={(subscription) => subscription.id}
        emptyLabel="No subscriptions found"
        actions={[
          {
            icon: <HiArrowTopRightOnSquare />,
            onClick: (subscription: Subscription) => {
              window.open(
                `https://dashboard.stripe.com/customers/${subscription.stripeCustomerId}?prefilled_email=${(subscription.user as IUser)?.email}`,
                '_blank',
              );
            },
            size: ButtonSize.SM,
            tooltip: 'Stripe',
            variant: ButtonVariant.SECONDARY,
          },
          {
            icon: <HiPencil />,
            onClick: (subscription: Subscription) =>
              openSubscriptionModal(subscription?.organization.id),
            size: ButtonSize.SM,
            tooltip: 'Edit',
            tooltipPosition: 'left',
            variant: ButtonVariant.DEFAULT,
          },
        ]}
      />

      <LazyModalSubscription
        organizationId={selectedOrgId}
        onConfirm={() => refresh()}
      />
    </Container>
  );
}
