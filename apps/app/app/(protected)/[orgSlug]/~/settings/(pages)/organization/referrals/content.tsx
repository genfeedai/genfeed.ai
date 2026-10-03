'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, ReferralRewardStatus } from '@genfeedai/contracts';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { ReferralStatProps } from '@props/settings/referral-hub-card.props';
import { ReferralsService } from '@services/billing/referrals.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Text } from '@ui/typography/text';
import { Copy, Gift, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

const REFERRAL_REWARD_STATUS_KEYS = {
  [ReferralRewardStatus.CANCELLED]: 'status.cancelled',
  [ReferralRewardStatus.FAILED]: 'status.failed',
  [ReferralRewardStatus.GRANTED]: 'status.granted',
  [ReferralRewardStatus.PENDING]: 'status.pending',
  [ReferralRewardStatus.PROCESSING]: 'status.processing',
  [ReferralRewardStatus.REVERSED]: 'status.reversed',
} as const;

function resolveShareUrl(value: string): string {
  if (!value.startsWith('/') || typeof window === 'undefined') {
    return value;
  }
  return new URL(value, window.location.origin).toString();
}

/**
 * Referrals: the share link, what it earns, and reward history. Lives on its
 * own settings page rather than squeezed under the credit top-up.
 */
export default function SettingsReferralsPage() {
  const translate = useTranslations('common.referrals');
  const { organizationId } = useBrand();
  const { sessionId, userId } = useAuthIdentity();
  const getReferralsService = useAuthedService((token: string) =>
    ReferralsService.getInstance(token),
  );
  const { data, isFetching, isLoading, error, refetch } = useQuery({
    enabled: Boolean(userId && organizationId),
    queryKey: ['referral-program', userId, sessionId, organizationId],
    queryFn: async () => (await getReferralsService()).getMine(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (error) {
      logger.error('GET /referrals/me failed', error);
    }
  }, [error]);

  if (error) {
    return (
      <div className="flex flex-col gap-4 pb-10">
        <h1 className="sr-only">{translate('title')}</h1>
        <Card label={translate('title')} bodyClassName="gap-4 p-4">
          <Alert variant="destructive">
            <TriangleAlert className="size-4" aria-hidden="true" />
            <AlertTitle>{translate('loadErrorTitle')}</AlertTitle>
            <AlertDescription>
              <p>{translate('loadErrorDescription')}</p>
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
        </Card>
      </div>
    );
  }
  const shareUrl = resolveShareUrl(data?.shareUrl ?? '');

  const copyLink = async () => {
    if (!shareUrl) {
      return;
    }
    await ClipboardService.getInstance().copyToClipboard(shareUrl);
    NotificationsService.getInstance().success(translate('copied'));
  };

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      <Card label={translate('title')} bodyClassName="gap-5 p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Gift className="size-5" aria-hidden="true" />
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            aria-label={translate('linkLabel')}
            className="font-mono text-sm"
            isReadOnly
            value={isLoading ? translate('loadingLink') : shareUrl}
          />
          <Button
            className="shrink-0"
            type="button"
            onClick={copyLink}
            isDisabled={isLoading || !shareUrl}
            icon={<Copy className="size-4" aria-hidden="true" />}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            {translate('copyLink')}
          </Button>
        </div>

        <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <ReferralStat
            label={translate('stats.referred')}
            value={data?.referralCount ?? 0}
          />
          <ReferralStat
            label={translate('stats.pending')}
            value={data?.pendingCredits ?? 0}
          />
          <ReferralStat
            label={translate('stats.earned')}
            value={data?.earnedCredits ?? 0}
          />
        </div>
      </Card>

      {data?.recentRewards.length ? (
        <Card label={translate('recentRewards')} bodyClassName="p-0">
          <div className="divide-y divide-border">
            {data.recentRewards.slice(0, 10).map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <Text as="p" size="sm" weight="medium">
                    {translate('creditsAmount', {
                      count: reward.rewardCredits.toLocaleString('en-US'),
                    })}
                  </Text>
                  <Text as="p" size="xs" color="muted">
                    {new Date(reward.createdAt).toLocaleDateString('en-US')}
                  </Text>
                </div>
                <Badge status={reward.status.toLowerCase()}>
                  {translate(REFERRAL_REWARD_STATUS_KEYS[reward.status])}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ReferralStat({ label, value }: ReferralStatProps) {
  return (
    <div className="flex flex-col gap-1">
      <Text as="p" size="xs" color="muted">
        {label}
      </Text>
      <Text as="p" size="xl" weight="bold" className="tabular-nums">
        {value.toLocaleString('en-US')}
      </Text>
    </div>
  );
}
