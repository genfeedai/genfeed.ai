'use client';

import {
  hasOrganizationBillingHint,
  shouldShowCreditsNav,
} from '@genfeedai/config/license';
import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  formatCreditBalanceExact,
} from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { getDesktopCreditsVisibility } from '@genfeedai/services/core/desktop-runtime.service';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTopbarBalances } from '@/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';

const DISMISS_KEY = 'genfeed:low-credits-dismissed:v1';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DismissState {
  balance: number;
  timestamp: number;
}

interface LowCreditsBannerProps {
  /**
   * Gates the ordinary low-balance warning. The "cannot afford a generation"
   * paywall state always shows, so unpaid users see why generation stopped.
   */
  isLowBalanceWarningEnabled?: boolean;
  variant?: 'inline' | 'shell';
}

function coerceFiniteBalance(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getDismissState(): DismissState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) {
    return null;
  }

  try {
    const state: DismissState = JSON.parse(raw);
    const isExpired = Date.now() - state.timestamp > DISMISS_TTL_MS;

    if (isExpired) {
      localStorage.removeItem(DISMISS_KEY);
      return null;
    }

    return state;
  } catch {
    localStorage.removeItem(DISMISS_KEY);
    return null;
  }
}

function shouldHideBanner(
  dismissState: DismissState | null,
  balance: number | null,
): boolean {
  if (!dismissState) {
    return false;
  }

  // Re-show once balance hits empty even if a prior low balance was dismissed.
  if (balance !== null && dismissState.balance > 0 && balance === 0) {
    return false;
  }

  return true;
}

interface LowCreditsContentProps extends LowCreditsBannerProps {
  creditsBreakdown: ReturnType<typeof useSubscription>['creditsBreakdown'];
}
function LowCreditsContent({
  isLowBalanceWarningEnabled = true,
  variant = 'shell',
  creditsBreakdown,
}: LowCreditsContentProps) {
  const translate = useTranslations('ui.lowCreditsBanner');
  const { orgHref } = useOrgUrl();
  const { accessState, isTrialUsedUp } = useAccessState();
  const isTrialEnded = isTrialUsedUp && accessState?.isTrialExpired === true;
  // Server-computed and relative to the organization's plan or pack (see
  // `LowCreditThresholdService`). Unknown means no ordinary low warning.
  const lowCreditThreshold = coerceFiniteBalance(
    accessState?.lowCreditThreshold,
  );
  const isBillingEnabled = hasOrganizationBillingHint();
  const ctaHref = orgHref(APP_ROUTES.SETTINGS.CREDITS);
  const plansHref = orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION);
  // Match AccountCredits: GEN wallet from topbar balances is the source of
  // truth the operator already sees. creditsBreakdown can be null when the
  // subscription query is still loading or was historically gated on ACTIVE.
  // The shared query means this banner reuses the chip's response instead of
  // issuing a second identical request on every protected page.
  const { genfeedBalance } = useTopbarBalances();
  const walletBalance = coerceFiniteBalance(genfeedBalance);
  const breakdownBalance = coerceFiniteBalance(creditsBreakdown?.total);
  const balance = walletBalance ?? breakdownBalance;

  const [isDismissed, setIsDismissed] = useState(() =>
    shouldHideBanner(getDismissState(), balance),
  );

  useEffect(() => {
    setIsDismissed(shouldHideBanner(getDismissState(), balance));
  }, [balance]);

  const severity = useMemo(() => {
    if (isTrialUsedUp) {
      return 'critical';
    }
    if (!isLowBalanceWarningEnabled || balance === null) {
      return null;
    }
    if (balance <= 0) {
      return 'critical';
    }
    return lowCreditThreshold !== null && balance < lowCreditThreshold
      ? 'warning'
      : null;
  }, [balance, isLowBalanceWarningEnabled, isTrialUsedUp, lowCreditThreshold]);

  const handleDismiss = useCallback(() => {
    if (balance === null) {
      return;
    }

    const state: DismissState = {
      balance,
      timestamp: Date.now(),
    };
    localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
    setIsDismissed(true);
  }, [balance]);

  // Out of generating credits is the paywall state, so it cannot be dismissed.
  if (!severity || (isDismissed && !isTrialUsedUp)) {
    return null;
  }

  const isCritical = severity === 'critical';
  const title = isTrialEnded
    ? translate('trialEndedTitle')
    : isTrialUsedUp
      ? translate('generationUnaffordableTitle')
      : isCritical
        ? "You've run out of credits"
        : "You're running low on credits";
  // Expired trial credits cannot be spent, so the title alone carries the state.
  const balanceLabel = isTrialEnded
    ? null
    : isCritical && balance !== null && balance > 0
      ? `${formatCreditBalanceExact(balance)} left`
      : isCritical
        ? '0 credits left'
        : `${formatCreditBalanceExact(balance)} remaining`;
  const description = isTrialEnded
    ? translate('trialEndedBody')
    : isTrialUsedUp
      ? translate('generationUnaffordableBody')
      : isBillingEnabled
        ? isCritical
          ? 'Top up your balance to keep generating content, running workflows, and using your organization tools without interruption.'
          : 'Your current balance is getting tight. Top up now so active generations and automations do not get blocked later.'
        : isCritical
          ? 'Your local install is missing usable provider capacity. Add or update API keys so generations and workflows can keep running.'
          : 'Your provider capacity is getting tight. Review API keys now so active generations and automations do not get blocked later.';
  const ctaLabel = isBillingEnabled ? 'Top up credits' : 'Buy credits';
  const isInline = variant === 'inline';

  const content = (
    <>
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {title}
        {balanceLabel ? (
          <Badge variant="secondary">{balanceLabel}</Badge>
        ) : null}
      </AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      <AlertActions>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        >
          <Link href={ctaHref}>
            {isTrialUsedUp ? translate('buyCredits') : ctaLabel}
          </Link>
        </Button>

        {isTrialUsedUp ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <Link href={plansHref}>{translate('seePlans')}</Link>
          </Button>
        ) : null}
      </AlertActions>
    </>
  );
  const alertClassName = cn('mx-auto', !isInline && 'max-w-6xl');
  const alertVariant = isCritical ? 'destructive' : 'warning';
  const alertIcon = <TriangleAlert className="size-5" />;

  return (
    <div
      className={cn('w-full', isInline ? '' : 'px-4 pt-3')}
      data-testid={isInline ? 'library-credit-notice' : 'shell-credit-notice'}
    >
      {isTrialUsedUp ? (
        <Alert
          className={alertClassName}
          icon={alertIcon}
          variant={alertVariant}
        >
          {content}
        </Alert>
      ) : (
        <Alert
          className={alertClassName}
          closeLabel="Dismiss low credits banner"
          icon={alertIcon}
          onClose={handleDismiss}
          variant={alertVariant}
        >
          {content}
        </Alert>
      )}
    </div>
  );
}

function WebLowCreditsBanner(props: LowCreditsBannerProps) {
  const { creditsBreakdown } = useSubscription();
  return <LowCreditsContent {...props} creditsBreakdown={creditsBreakdown} />;
}

export default function LowCreditsBanner(props: LowCreditsBannerProps) {
  const runtime = useDesktopRuntimeContext();
  if (runtime.status === 'web') return <WebLowCreditsBanner {...props} />;
  if (!shouldShowCreditsNav(getDesktopCreditsVisibility(runtime))) return null;
  return <LowCreditsContent {...props} creditsBreakdown={null} />;
}
