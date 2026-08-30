'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ReferralsService } from '@services/billing/referrals.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Text } from '@ui/typography/text';
import { Copy, Gift } from 'lucide-react';

export default function ReferralHubCard() {
  const getReferralsService = useAuthedService((token: string) =>
    ReferralsService.getInstance(token),
  );
  const { data, isLoading, error } = useQuery({
    queryKey: ['referral-program'],
    queryFn: async () => (await getReferralsService()).getMine(),
    staleTime: 30_000,
  });

  if (error) {
    logger.error('GET /referrals/me failed', error);
  }

  const copyLink = async () => {
    if (!data?.shareUrl) {
      return;
    }
    await ClipboardService.getInstance().copyToClipboard(data.shareUrl);
    NotificationsService.getInstance().success('Referral link copied');
  };

  return (
    <Card label="Refer & earn" bodyClassName="gap-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <Text weight="semibold">Earn 10% in credits</Text>
          <Text size="sm" color="muted">
            Share your link. You earn 10% of each referred customer&apos;s
            pay-as-you-go credit purchases for 12 months. Rewards settle after
            seven days and expire after 12 months.
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Referral link"
          readOnly
          value={isLoading ? 'Loading referral link…' : (data?.shareUrl ?? '')}
        />
        <Button
          type="button"
          onClick={copyLink}
          isDisabled={isLoading || !data?.shareUrl}
          icon={<Copy className="size-4" aria-hidden="true" />}
          withWrapper={false}
        >
          Copy link
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ReferralStat label="Referred" value={data?.referralCount ?? 0} />
        <ReferralStat label="Pending" value={data?.pendingCredits ?? 0} />
        <ReferralStat label="Earned" value={data?.earnedCredits ?? 0} />
      </div>

      {data?.recentRewards.length ? (
        <div className="space-y-2">
          <Text size="sm" weight="semibold">
            Recent rewards
          </Text>
          {data.recentRewards.slice(0, 5).map((reward) => (
            <div
              key={reward.id}
              className="flex items-center justify-between rounded border p-3"
            >
              <div>
                <Text size="sm" weight="medium">
                  {reward.rewardCredits.toLocaleString()} credits
                </Text>
                <Text size="xs" color="muted">
                  {new Date(reward.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <Badge status={reward.status.toLowerCase()} />
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ReferralStat({ label, value }: { label: string; value: number }) {
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
