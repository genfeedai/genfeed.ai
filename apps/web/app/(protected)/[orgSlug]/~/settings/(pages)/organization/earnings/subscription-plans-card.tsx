'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { CardGap, CardPadding } from '@genfeedai/contracts';
import type { IUpdateCreatorSubscriptionPlanRequest } from '@genfeedai/contracts/interfaces/billing';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { CreatorPaymentsService } from '@services/billing/creator-payments.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { Text } from '@ui/typography/text';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import SubscriptionPlanRow from './subscription-plan-row';

/**
 * Monthly prices for the organization's public profiles (#9717). Hidden when
 * the organization has no public profile to sell.
 */
export default function SubscriptionPlansCard() {
  const translate = useTranslations('pages.creatorEarnings.plans');
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
    'creator-subscription-plans',
    userId,
    sessionId,
    organizationId,
  ];
  const { data } = useQuery({
    enabled: Boolean(userId && organizationId),
    queryFn: async ({ signal }) =>
      (await getService()).listSubscriptionPlans(signal),
    queryKey,
    staleTime: 30_000,
  });

  const save = async (
    brandId: string,
    request: IUpdateCreatorSubscriptionPlanRequest,
  ) => {
    try {
      await (await getService()).updateSubscriptionPlan(brandId, request);
      await queryClient.invalidateQueries({ queryKey });
      NotificationsService.getInstance().success(translate('saved'));
    } catch {
      NotificationsService.getInstance().error(translate('saveFailed'));
    }
  };

  if (!data?.length) {
    return null;
  }

  return (
    <Card label={translate('title')} padding={CardPadding.LG} gap={CardGap.LG}>
      <Text as="p" size="sm" color="muted" className="max-w-2xl">
        {translate('description')}
      </Text>
      <div className="divide-y divide-border rounded-lg border border-border">
        {data.map((plan) => (
          <SubscriptionPlanRow key={plan.brandId} plan={plan} onSave={save} />
        ))}
      </div>
    </Card>
  );
}
