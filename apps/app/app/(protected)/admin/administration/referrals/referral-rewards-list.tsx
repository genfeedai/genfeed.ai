'use client';

import { ReferralRewardStatus } from '@genfeedai/contracts';
import type { IReferralAdminReward } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { ReferralsService } from '@services/billing/referrals.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Gift, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

const REFERRAL_REWARD_STATUS_LABELS: Record<ReferralRewardStatus, string> = {
  [ReferralRewardStatus.CANCELLED]: 'Cancelled',
  [ReferralRewardStatus.FAILED]: 'Failed',
  [ReferralRewardStatus.GRANTED]: 'Granted',
  [ReferralRewardStatus.PENDING]: 'Pending',
  [ReferralRewardStatus.PROCESSING]: 'Processing',
  [ReferralRewardStatus.REVERSED]: 'Reversed',
};

function compactId(value: string | null): string {
  if (!value) {
    return '—';
  }
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export default function ReferralRewardsList() {
  const translate = useTranslations('common.referrals');
  const { orgId, sessionId, userId } = useAuthIdentity();
  const getReferralsService = useAuthedService((token: string) =>
    ReferralsService.getInstance(token),
  );
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    enabled: Boolean(userId),
    queryKey: ['admin-referral-rewards', userId, sessionId, orgId],
    queryFn: async () => (await getReferralsService()).getAdminRewards(),
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /referrals/admin/rewards failed', error);
    }
  }, [error]);

  const columns: TableColumn<IReferralAdminReward>[] = [
    {
      header: 'Status',
      key: 'status',
      render: (reward) => (
        <Badge status={reward.status.toLowerCase()}>
          {REFERRAL_REWARD_STATUS_LABELS[reward.status]}
        </Badge>
      ),
    },
    {
      header: 'Reward',
      key: 'rewardCredits',
      render: (reward) =>
        `${(reward.rewardCredits - reward.reversedCredits).toLocaleString('en-US')} credits`,
    },
    {
      header: 'Purchase',
      key: 'netAmountCents',
      render: (reward) => `$${(reward.netAmountCents / 100).toFixed(2)}`,
    },
    {
      header: 'Referrer account',
      key: 'referrerBillingAccountId',
      render: (reward) => compactId(reward.referrerBillingAccountId),
    },
    {
      header: 'Referred account',
      key: 'referredBillingAccountId',
      render: (reward) => compactId(reward.referredBillingAccountId),
    },
    {
      header: 'Checkout',
      key: 'stripeCheckoutSessionId',
      render: (reward) => compactId(reward.stripeCheckoutSessionId),
    },
    {
      header: 'Eligible',
      key: 'eligibleAt',
      render: (reward) => new Date(reward.eligibleAt).toLocaleString('en-US'),
    },
    {
      header: 'Attempts',
      key: 'attemptCount',
      render: (reward) => reward.attemptCount.toLocaleString('en-US'),
    },
  ];

  return (
    <Container
      label="Referral Rewards"
      description="Audit referral attribution, pending settlements, grants, and reversals"
      icon={Gift}
      right={
        <ButtonRefresh
          onClick={() => refetch()}
          isRefreshing={isFetching && !isLoading}
        />
      }
    >
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden="true" />
          <AlertTitle>{translate('loadErrorTitle')}</AlertTitle>
          <AlertDescription>
            <p>{translate('adminLoadErrorDescription')}</p>
            <Button
              className="mt-3"
              isDisabled={isFetching}
              onClick={() => void refetch()}
              type="button"
              withWrapper={false}
            >
              {translate('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <AppTable<IReferralAdminReward>
          items={data ?? []}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(reward) => reward.id}
          emptyLabel="No referral rewards found"
        />
      )}
    </Container>
  );
}
