'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import {
  hasOrganizationBillingHint,
  shouldShowCreditsNav,
} from '@genfeedai/config/license';
import { ButtonVariant, CardGap, CardPadding } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getDesktopCreditsVisibility } from '@genfeedai/services/core/desktop-runtime.service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Text } from '@ui/typography/text';
import { Gift, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';
import TrialCardClaimCard from './trial-card-claim-card';

/**
 * Credits surface: balance + top-up.
 * - Org Stripe PAYG when SaaS/EE or a local PAYG price is configured.
 * - Managed Genfeed Cloud checkout only for community self-host without PAYG.
 */
export default function SettingsCreditsPage() {
  const runtime = useDesktopRuntimeContext();
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );
  const translate = useTranslations('common.settings.creditsBalance');

  if (!showCredits) {
    return (
      <div className="flex flex-col gap-4 pb-10">
        <h1 className="sr-only">{translate('title')}</h1>
        <Alert>
          <AlertTitle>{translate('unavailableTitle')}</AlertTitle>
          <AlertDescription>
            {translate('unavailableDescription')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <SettingsCreditsContent />;
}

function SettingsCreditsContent() {
  const { creditsBreakdown, error, isLoading, refreshCreditsBreakdown } =
    useSubscription();
  const [isRetryingBalance, setIsRetryingBalance] = useState(false);
  const { orgHref } = useOrgUrl();
  const translate = useTranslations('common.settings.creditsBalance');
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

  async function handleBalanceRetry() {
    setIsRetryingBalance(true);
    try {
      await refreshCreditsBreakdown();
    } finally {
      setIsRetryingBalance(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">{translate('title')}</h1>

      {isLoading ? (
        <Card
          label={translate('balance')}
          data-testid="credits-balance-loading"
        >
          <SkeletonCard showImage={false} />
        </Card>
      ) : error ? (
        <Card label={translate('balance')}>
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" className="size-4" />
            <AlertDescription>{translate('loadError')}</AlertDescription>
          </Alert>
          <Button
            variant={ButtonVariant.SECONDARY}
            isLoading={isRetryingBalance}
            onClick={() => void handleBalanceRetry()}
            withWrapper={false}
          >
            {translate('retryBalance')}
          </Button>
        </Card>
      ) : creditsBreakdown ? (
        <Card
          label={translate('balance')}
          padding={CardPadding.LG}
          gap={CardGap.LG}
        >
          {isLowCredits && (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" className="size-4" />
              <AlertDescription>
                {translate('lowCreditsWarning')}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Text as="p" size="sm" color="muted">
                {translate('creditsLeft')}
              </Text>
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {creditsBreakdown.total.toLocaleString('en-US', {
                  maximumFractionDigits: 1,
                })}
                {hasCycleTotal ? (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    {translate('ofTotal', {
                      total: cycleTotal.toLocaleString('en-US', {
                        maximumFractionDigits: 1,
                      }),
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
            aria-label={translate('progressLabel')}
            size="lg"
            tone={isLowCredits ? 'warning' : 'primary'}
            value={remainingPercent ?? 0}
          />
          <Text as="p" size="xs" color="muted">
            {translate('cycleNote')}
            {creditsBreakdown.cycleEndAt ? (
              <>
                {' '}
                {translate('resets')}{' '}
                <ClientFormattedDate
                  format="date"
                  locales="en-US"
                  options={{ day: 'numeric', month: 'long' }}
                  value={creditsBreakdown.cycleEndAt}
                />
              </>
            ) : null}
          </Text>
        </Card>
      ) : null}

      {isBillingEnabled && !useManagedCloudCheckout ? (
        <TrialCardClaimCard onClaimed={refreshCreditsBreakdown} />
      ) : null}

      {useManagedCloudCheckout ? (
        <ManagedCreditsCheckoutCard />
      ) : (
        <AddCreditsCard />
      )}

      {isBillingEnabled && !useManagedCloudCheckout ? (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift aria-hidden="true" className="size-4" />
              </div>
              <div>
                <Text as="p" size="sm" weight="semibold">
                  {translate('referralTitle')}
                </Text>
                <Text as="p" size="xs" color="muted">
                  {translate('referralDescription')}
                </Text>
              </div>
            </div>
            <Button asChild variant={ButtonVariant.SECONDARY}>
              <Link href={orgHref(APP_ROUTES.SETTINGS.REFERRALS)}>
                {translate('viewReferrals')}
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
