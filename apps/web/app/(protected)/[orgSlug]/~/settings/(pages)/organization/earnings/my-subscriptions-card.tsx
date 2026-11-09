'use client';

import {
  ButtonVariant,
  CardPadding,
  CreatorSubscriptionStatus,
} from '@genfeedai/contracts';
import type { ICreatorSubscriptionSummary } from '@genfeedai/contracts/interfaces/billing';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { CreatorPaymentsService } from '@services/billing/creator-payments.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

const PERIOD_END_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
});

/** The signed-in reader's paid creator subscriptions (#9717), with cancel. */
export default function MySubscriptionsCard() {
  const translate = useTranslations('pages.creatorEarnings.mine');
  const { sessionId, userId } = useAuthIdentity();
  const queryClient = useQueryClient();
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const queryKey = ['creator-subscriptions-mine', userId, sessionId];
  const { data } = useQuery({
    enabled: Boolean(userId),
    queryFn: async ({ signal }) =>
      (await getService()).listMySubscriptions(signal),
    queryKey,
    staleTime: 30_000,
  });

  const toggle = async (subscription: ICreatorSubscriptionSummary) => {
    try {
      await (await getService()).setCancelAtPeriodEnd(
        subscription.id,
        !subscription.cancelAtPeriodEnd,
      );
      await queryClient.invalidateQueries({ queryKey });
    } catch {
      NotificationsService.getInstance().error(translate('updateFailed'));
    }
  };

  if (!data?.length) {
    return null;
  }

  return (
    <Card label={translate('title')} padding={CardPadding.NONE}>
      <div className="divide-y divide-border">
        {data.map((subscription) => {
          const date = PERIOD_END_FORMAT.format(
            new Date(subscription.currentPeriodEnd),
          );
          return (
            <div
              key={subscription.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Text as="p" size="sm">
                  {subscription.cancelAtPeriodEnd
                    ? translate('ends', {
                        creator: subscription.creatorLabel,
                        date,
                      })
                    : translate('renews', {
                        creator: subscription.creatorLabel,
                        date,
                        price: subscription.priceCredits,
                      })}
                </Text>
                {subscription.status === CreatorSubscriptionStatus.PAST_DUE ? (
                  <Badge status="past_due">{translate('pastDue')}</Badge>
                ) : null}
              </div>
              <Button
                variant={ButtonVariant.SECONDARY}
                label={translate(
                  subscription.cancelAtPeriodEnd ? 'keep' : 'cancel',
                )}
                onClick={() => void toggle(subscription)}
                withWrapper={false}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
