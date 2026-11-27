'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CardPadding,
  CreatorSubscriptionStatus,
} from '@genfeedai/contracts';
import type { ICreatorTeamSubscription } from '@genfeedai/contracts/interfaces/billing';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { CreatorPaymentsService } from '@services/billing/creator-payments.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

/**
 * Every creator subscription the workspace pays for, whichever member
 * subscribed (#9793). Owners and admins can end any of them at the period end.
 */
export default function TeamSubscriptionsCard() {
  const translate = useTranslations('pages.creatorEarnings.team');
  const { organizationId } = useBrand();
  const { sessionId, userId } = useAuthIdentity();
  const queryClient = useQueryClient();
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const queryKey = [
    'creator-subscriptions-team',
    userId,
    sessionId,
    organizationId,
  ];
  const { data } = useQuery({
    enabled: Boolean(userId && organizationId),
    queryFn: async ({ signal }) =>
      (await getService()).listTeamSubscriptions(signal),
    queryKey,
    staleTime: 30_000,
  });

  const toggle = async (subscription: ICreatorTeamSubscription) => {
    const isCancelling = !subscription.cancelAtPeriodEnd;
    try {
      await (await getService()).setTeamSubscriptionCancelAtPeriodEnd(
        subscription.id,
        isCancelling,
      );
      await queryClient.invalidateQueries({ queryKey });
      NotificationsService.getInstance().success(
        translate(isCancelling ? 'cancelled' : 'kept', {
          creator: subscription.creatorLabel,
          date: DATE_FORMAT.format(new Date(subscription.currentPeriodEnd)),
        }),
      );
    } catch {
      NotificationsService.getInstance().error(translate('updateFailed'));
    }
  };

  if (!data?.length) {
    return null;
  }

  const columns: TableColumn<ICreatorTeamSubscription>[] = [
    {
      header: translate('columns.reader'),
      key: 'readerName',
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.readerName}
          {row.readerId === userId ? (
            <Badge variant="secondary">{translate('you')}</Badge>
          ) : null}
        </span>
      ),
    },
    {
      header: translate('columns.creator'),
      key: 'creatorLabel',
      subtext: (row) => `@${row.creatorHandle}`,
    },
    {
      header: translate('columns.price'),
      key: 'priceCredits',
      render: (row) => translate('price', { amount: row.priceCredits }),
    },
    {
      header: translate('columns.nextCharge'),
      key: 'currentPeriodEnd',
      render: (row) => {
        const date = DATE_FORMAT.format(new Date(row.currentPeriodEnd));
        if (row.cancelAtPeriodEnd) {
          return (
            <Text as="span" size="sm" color="muted">
              {translate('ends', { date })}
            </Text>
          );
        }
        return (
          <span className="flex items-center gap-2">
            {date}
            {row.status === CreatorSubscriptionStatus.PAST_DUE ? (
              <Badge status="past_due">{translate('pastDue')}</Badge>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      label={translate('title')}
      description={translate('description')}
      padding={CardPadding.NONE}
    >
      <AppTable<ICreatorTeamSubscription>
        ariaLabel={translate('title')}
        columns={columns}
        getRowKey={(row) => row.id}
        items={data}
        renderRowActions={(row) => (
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            label={translate(row.cancelAtPeriodEnd ? 'keep' : 'cancel')}
            onClick={() => void toggle(row)}
            withWrapper={false}
          />
        )}
      />
    </Card>
  );
}
