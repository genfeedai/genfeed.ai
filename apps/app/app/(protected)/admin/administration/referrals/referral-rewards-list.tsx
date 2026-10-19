'use client';

import { ReferralRewardStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IReferralAdminReward } from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { ReferralsService } from '@services/billing/referrals.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Badge from '@ui/display/badge/Badge';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Gift, TriangleAlert } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
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
  const referralT = useTranslations('ui.rowSidebar.referral');
  const { orgId, sessionId, userId } = useAuthIdentity();
  const currentPage = Number(useSearchParams().get('page')) || 1;
  const getReferralsService = useAuthedService((token: string) =>
    ReferralsService.getInstance(token),
  );
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    enabled: Boolean(userId),
    queryKey: ['admin-referral-rewards', userId, sessionId, orgId, currentPage],
    queryFn: async () =>
      (await getReferralsService()).getAdminRewards({
        limit: ITEMS_PER_PAGE,
        page: currentPage,
      }),
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

  const getRewardCredits = (reward: IReferralAdminReward): string =>
    referralT('credits', {
      count: (reward.rewardCredits - reward.reversedCredits).toLocaleString(
        'en-US',
      ),
    });

  const rowSidebar = createSummaryRowSidebar<IReferralAdminReward>({
    getBadges: (reward) => (
      <Badge status={reward.status.toLowerCase()}>
        {REFERRAL_REWARD_STATUS_LABELS[reward.status]}
      </Badge>
    ),
    getFacts: (reward) => [
      {
        id: 'reward',
        label: referralT('reward'),
        value: getRewardCredits(reward),
      },
      {
        id: 'purchase',
        label: referralT('purchase'),
        value: `$${(reward.netAmountCents / 100).toFixed(2)}`,
      },
      {
        id: 'referrer',
        label: referralT('referrerAccount'),
        value: reward.referrerBillingAccountId,
      },
      {
        id: 'referred',
        label: referralT('referredAccount'),
        value: reward.referredBillingAccountId,
      },
      {
        id: 'checkout',
        label: referralT('checkout'),
        value: reward.stripeCheckoutSessionId,
      },
      {
        id: 'eligible',
        label: referralT('eligible'),
        value: new Date(reward.eligibleAt).toLocaleString('en-US'),
      },
      {
        id: 'attempts',
        label: referralT('attempts'),
        value: reward.attemptCount.toLocaleString('en-US'),
      },
      {
        id: 'failure',
        label: referralT('failureReason'),
        value: reward.failureReason,
      },
    ],
    getId: (reward) => reward.id,
    getSubtitle: getRewardCredits,
    getTitle: (reward) => referralT('title', { id: compactId(reward.id) }),
    kind: 'record',
  });

  return (
    <AdminPageShell
      title="Referral Rewards"
      icon={Gift}
      onRefresh={() => refetch()}
      isRefreshing={isFetching && !isLoading}
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
          rowSidebar={rowSidebar}
          emptyLabel="No referral rewards found"
        />
      )}
      {error ? null : (
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="rewards" />
        </div>
      )}
    </AdminPageShell>
  );
}
