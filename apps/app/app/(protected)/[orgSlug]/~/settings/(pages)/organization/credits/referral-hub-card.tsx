'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ReferralRewardStatus } from '@genfeedai/enums';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
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

export default function ReferralHubCard() {
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
    <Card label={translate('title')} bodyClassName="gap-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <Text weight="semibold">{translate('headline')}</Text>
          <Text size="sm" color="muted">
            {translate('description')}
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={translate('linkLabel')}
          isReadOnly
          value={isLoading ? translate('loadingLink') : shareUrl}
        />
        <Button
          type="button"
          onClick={copyLink}
          isDisabled={isLoading || !shareUrl}
          icon={<Copy className="size-4" aria-hidden="true" />}
          withWrapper={false}
        >
          {translate('copyLink')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
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

      {data?.recentRewards.length ? (
        <div className="space-y-2">
          <Text size="sm" weight="semibold">
            {translate('recentRewards')}
          </Text>
          {data.recentRewards.slice(0, 5).map((reward) => (
            <div
              key={reward.id}
              className="flex items-center justify-between rounded border p-3"
            >
              <div>
                <Text size="sm" weight="medium">
                  {translate('creditsAmount', {
                    count: reward.rewardCredits.toLocaleString(),
                  })}
                </Text>
                <Text size="xs" color="muted">
                  {new Date(reward.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <Badge status={reward.status.toLowerCase()}>
                {translate(REFERRAL_REWARD_STATUS_KEYS[reward.status])}
              </Badge>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

type ReferralStatProps = {
  label: string;
  value: number;
};

function ReferralStat({ label, value }: ReferralStatProps) {
  return (
    <div className="rounded bg-muted/50 p-3">
      <Text size="xs" color="muted">
        {label}
      </Text>
      <Text as="span" size="lg" weight="bold">
        {value.toLocaleString()}
      </Text>
    </div>
  );
}
