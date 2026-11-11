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
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { coerceFiniteBalance } from '@/components/topbars/credits-bar/coerce-finite-balance';
import { useTopbarBalances } from '@/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';
import { useFeatureFlag } from '@/hooks/feature-flags/use-feature-flag';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';

type CreditsStatus = 'empty' | 'low' | 'trial-ended' | 'unaffordable';

/**
 * The paywall states (`trial-ended`, `unaffordable`) always show. `empty` and
 * `low` are the ordinary balance warnings, behind the platform flag.
 */
function getCreditsStatus({
  balance,
  isLowBalanceWarningEnabled,
  isTrialEnded,
  isTrialUsedUp,
  lowCreditThreshold,
}: {
  balance: number | null;
  isLowBalanceWarningEnabled: boolean;
  isTrialEnded: boolean;
  isTrialUsedUp: boolean;
  lowCreditThreshold: number | null;
}): CreditsStatus | null {
  if (isTrialEnded) {
    return 'trial-ended';
  }
  if (isTrialUsedUp) {
    return 'unaffordable';
  }
  if (!isLowBalanceWarningEnabled || balance === null) {
    return null;
  }
  if (balance <= 0) {
    return 'empty';
  }
  return lowCreditThreshold !== null && balance < lowCreditThreshold
    ? 'low'
    : null;
}

interface TopbarCreditsStatusContentProps {
  creditsBreakdown: ReturnType<typeof useSubscription>['creditsBreakdown'];
  /**
   * Gates the ordinary low-balance warning. The "cannot afford a generation"
   * paywall state always shows, so unpaid users see why generation stopped.
   */
  isLowBalanceWarningEnabled: boolean;
}

function TopbarCreditsStatusContent({
  creditsBreakdown,
  isLowBalanceWarningEnabled,
}: TopbarCreditsStatusContentProps) {
  const translate = useTranslations('ui.creditsStatus');
  const { orgHref } = useOrgUrl();
  const { accessState, isTrialUsedUp } = useAccessState();
  const isTrialEnded = isTrialUsedUp && accessState?.isTrialExpired === true;
  // Server-computed and relative to the organization's plan or pack (see
  // `LowCreditThresholdService`). Unknown means no ordinary low warning.
  const lowCreditThreshold = coerceFiniteBalance(
    accessState?.lowCreditThreshold,
  );
  // GEN wallet from the shared topbar balances is the source of truth the
  // operator already sees. creditsBreakdown can be null while the subscription
  // query is loading, so it is only the fallback.
  const { genfeedBalance } = useTopbarBalances();
  const balance =
    coerceFiniteBalance(genfeedBalance) ??
    coerceFiniteBalance(creditsBreakdown?.total);

  const status = getCreditsStatus({
    balance,
    isLowBalanceWarningEnabled,
    isTrialEnded,
    isTrialUsedUp,
    lowCreditThreshold,
  });

  // Nothing renders while the balance is unknown or comfortably above the
  // server threshold.
  if (!status) {
    return null;
  }

  const isCritical = status !== 'low';
  const copy = {
    empty: {
      action: translate('topUp'),
      label: translate('outLabel'),
      message: translate('outMessage'),
    },
    low: {
      action: translate('topUp'),
      label: translate('lowLabel', {
        balance: formatCreditBalanceExact(balance ?? 0),
      }),
      message: translate('lowMessage'),
    },
    'trial-ended': {
      action: translate('buyCredits'),
      label: translate('trialEndedLabel'),
      message: translate('trialEndedMessage'),
    },
    unaffordable: {
      action: translate('buyCredits'),
      label: translate('unaffordableLabel'),
      message: translate('unaffordableMessage'),
    },
  }[status];

  return (
    <Button
      asChild
      size={ButtonSize.SM}
      textTransform="none"
      tooltip={copy.message}
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
    >
      <Link
        data-testid="topbar-credits-status"
        href={orgHref(APP_ROUTES.SETTINGS.CREDITS)}
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isCritical ? 'bg-destructive' : 'bg-warning',
          )}
        />
        <span className="max-sm:hidden">{copy.label}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground max-sm:hidden"
        >
          ·
        </span>
        <span className="font-semibold">{copy.action}</span>
      </Link>
    </Button>
  );
}

function WebTopbarCreditsStatus(props: {
  isLowBalanceWarningEnabled: boolean;
}) {
  const { creditsBreakdown } = useSubscription();
  return (
    <TopbarCreditsStatusContent
      {...props}
      creditsBreakdown={creditsBreakdown}
    />
  );
}

/**
 * The out-of-credits, trial-ended and low-credits notice. One pill in the
 * topbar with one action that opens Credits; it replaces the page banner so
 * it shows on every page without moving content.
 */
export default function TopbarCreditsStatus() {
  const runtime = useDesktopRuntimeContext();
  const isLowBalanceWarningEnabled = useFeatureFlag('low_credits_banner');

  if (!hasOrganizationBillingHint()) return null;
  if (runtime.status === 'web') {
    return (
      <WebTopbarCreditsStatus
        isLowBalanceWarningEnabled={isLowBalanceWarningEnabled}
      />
    );
  }
  if (!shouldShowCreditsNav(getDesktopCreditsVisibility(runtime))) return null;
  return (
    <TopbarCreditsStatusContent
      creditsBreakdown={null}
      isLowBalanceWarningEnabled={isLowBalanceWarningEnabled}
    />
  );
}
