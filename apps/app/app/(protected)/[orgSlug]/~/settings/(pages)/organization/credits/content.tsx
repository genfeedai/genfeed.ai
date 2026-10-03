'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Text } from '@ui/typography/text';
import { Gift, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';

/**
 * Credits surface: balance + top-up.
 * - Org Stripe PAYG when SaaS/EE or a local PAYG price is configured.
 * - Managed Genfeed Cloud checkout only for community self-host without PAYG.
 */
export default function SettingsCreditsPage() {
  const { creditsBreakdown, isLoading } = useSubscription();
  const { orgHref } = useOrgUrl();
  const isBillingEnabled = hasOrganizationBillingHint();
  const hasLocalPaygPrice = Boolean(EnvironmentService.plans.payg);
  const useManagedCloudCheckout =
    isSelfHostedDeployment() && !isBillingEnabled && !hasLocalPaygPrice;

  const remainingPercent = creditsBreakdown
    ? Math.max(
        0,
        Math.min(
          100,
          creditsBreakdown.remainingPercent ??
            (creditsBreakdown.cycleTotal && creditsBreakdown.cycleTotal > 0
              ? (creditsBreakdown.total / creditsBreakdown.cycleTotal) * 100
              : creditsBreakdown.total > 0
                ? 100
                : 0),
        ),
      )
    : null;
  const isLowCredits = (creditsBreakdown?.total ?? 0) < 1000;
  const cycleTotal = creditsBreakdown?.cycleTotal ?? 0;
  const hasCycleTotal = cycleTotal > 0;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Credits</h1>

      {isLoading ? (
        <Card
          label="Balance"
          bodyClassName="gap-3 p-4"
          data-testid="credits-balance-loading"
        >
          <SkeletonCard showImage={false} />
        </Card>
      ) : creditsBreakdown ? (
        <Card label="Balance" bodyClassName="gap-4 p-5">
          {isLowCredits && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" className="size-4" />
              <AlertDescription>
                Low credits warning: your organization is below 1,000 credits.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Text as="p" size="sm" color="muted">
                Credits left
              </Text>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {creditsBreakdown.total.toLocaleString('en-US', {
                  maximumFractionDigits: 1,
                })}
                {hasCycleTotal ? (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    of{' '}
                    {cycleTotal.toLocaleString('en-US', {
                      maximumFractionDigits: 1,
                    })}
                  </span>
                ) : null}
              </p>
            </div>
            <Text
              as="span"
              size="lg"
              weight="semibold"
              className="tabular-nums"
            >
              {Math.round(remainingPercent ?? 0)}%
            </Text>
          </div>
          <Progress
            aria-label="Credits left this cycle"
            className={cn('h-2.5', isLowCredits && 'bg-warning/20')}
            value={remainingPercent ?? 0}
          />
          <Text as="p" size="xs" color="muted">
            Based on this cycle's total: subscription credits plus packs bought
            this cycle.
            {creditsBreakdown.cycleEndAt ? (
              <>
                {' '}
                Resets{' '}
                <ClientFormattedDate
                  format="date"
                  locales="en-US"
                  options={{ day: 'numeric', month: 'long' }}
                  value={creditsBreakdown.cycleEndAt}
                />
                .
              </>
            ) : null}
          </Text>
        </Card>
      ) : null}

      {useManagedCloudCheckout ? (
        <ManagedCreditsCheckoutCard />
      ) : (
        <AddCreditsCard />
      )}

      {isBillingEnabled && !useManagedCloudCheckout ? (
        <Card bodyClassName="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift aria-hidden="true" className="size-4" />
              </div>
              <div>
                <Text as="p" size="sm" weight="semibold">
                  Earn 10% in credits
                </Text>
                <Text as="p" size="xs" color="muted">
                  Share your referral link and earn on referred customers'
                  credit purchases.
                </Text>
              </div>
            </div>
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.REFERRALS)}>
                View referrals
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
