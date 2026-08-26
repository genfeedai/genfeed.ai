'use client';

import {
  hasOrganizationBillingHint,
  shouldShowCreditsNav,
} from '@genfeedai/config/license';
import { APP_ROUTES } from '@genfeedai/constants';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatNumberWithCommas } from '@genfeedai/helpers/formatting/format/format.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@genfeedai/hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { CreditsService } from '@genfeedai/services/billing/credits.service';
import { Button } from '@ui/primitives/button';
import { TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

const LOW_CREDITS_THRESHOLD = 1000;
const DISMISS_KEY = 'genfeed:low-credits-dismissed:v1';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DismissState {
  balance: number;
  timestamp: number;
}

interface LowCreditsBannerProps {
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

export default function LowCreditsBanner({
  variant = 'shell',
}: LowCreditsBannerProps) {
  const { organizationId } = useBrand();
  const { creditsBreakdown } = useSubscription();
  const { orgHref } = useOrgUrl();
  const isBillingEnabled = hasOrganizationBillingHint();
  const showCreditsWallet = shouldShowCreditsNav();
  const ctaHref = orgHref(APP_ROUTES.SETTINGS.CREDITS);
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );
  // Match TopbarCreditsBar: GEN wallet from topbar balances is the source of
  // truth the operator already sees. creditsBreakdown can be null when the
  // subscription query is still loading or was historically gated on ACTIVE.
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const breakdownBalance = coerceFiniteBalance(creditsBreakdown?.total);
  const balance = walletBalance ?? breakdownBalance;

  useEffect(() => {
    if (!showCreditsWallet || !organizationId) {
      setWalletBalance(null);
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const service = await getCreditsService();
        const data = await service.getTopbarBalances();
        const genfeedSegment = data.segments?.find(
          (segment) => segment.provider === 'genfeed',
        );
        if (!isCancelled) {
          setWalletBalance(coerceFiniteBalance(genfeedSegment?.balance));
        }
      } catch {
        if (!isCancelled) {
          setWalletBalance(null);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [getCreditsService, organizationId, showCreditsWallet]);

  const [isDismissed, setIsDismissed] = useState(() =>
    shouldHideBanner(getDismissState(), balance),
  );

  useEffect(() => {
    setIsDismissed(shouldHideBanner(getDismissState(), balance));
  }, [balance]);

  const severity = useMemo(() => {
    if (balance === null || balance >= LOW_CREDITS_THRESHOLD) {
      return null;
    }
    return balance === 0 ? 'critical' : 'warning';
  }, [balance]);

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

  if (!severity || isDismissed) {
    return null;
  }

  const isCritical = severity === 'critical';
  const title = isCritical
    ? "You've run out of credits"
    : "You're running low on credits";
  const balanceLabel = isCritical
    ? '0 credits left'
    : `${formatNumberWithCommas(balance)} remaining`;
  const description = isBillingEnabled
    ? isCritical
      ? 'Top up your balance to keep generating content, running workflows, and using your organization tools without interruption.'
      : 'Your current balance is getting tight. Top up now so active generations and automations do not get blocked later.'
    : isCritical
      ? 'Your local install is missing usable provider capacity. Add or update API keys so generations and workflows can keep running.'
      : 'Your provider capacity is getting tight. Review API keys now so active generations and automations do not get blocked later.';
  const ctaLabel = isBillingEnabled ? 'Top up credits' : 'Buy credits';
  const isInline = variant === 'inline';

  return (
    <div
      className={cn('w-full', isInline ? '' : 'px-4 pt-3')}
      data-testid={isInline ? 'library-credit-notice' : 'shell-credit-notice'}
    >
      <div
        role="alert"
        className={cn(
          'mx-auto flex w-full flex-col gap-3 border text-sm backdrop-blur',
          isInline
            ? 'rounded-[1.4rem] px-4 py-3 shadow-none'
            : 'max-w-6xl rounded-2xl px-4 py-3 shadow-border',
          isCritical
            ? 'border-red-500/25 bg-red-500/[0.08] text-red-100'
            : 'border-amber-500/25 bg-amber-500/[0.08] text-amber-50',
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'flex shrink-0 items-center justify-center border',
                isInline ? 'size-9 rounded-lg' : 'size-10 rounded-xl',
                isCritical
                  ? 'border-red-400/25 bg-red-500/[0.12] text-red-300'
                  : 'border-amber-400/25 bg-amber-500/[0.12] text-amber-300',
              )}
            >
              <TriangleAlert className="size-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold leading-5 text-foreground">
                  {title}
                </p>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em]',
                    isCritical
                      ? 'border-red-400/20 bg-red-500/[0.12] text-red-200'
                      : 'border-amber-400/20 bg-amber-500/[0.12] text-amber-200',
                  )}
                >
                  {balanceLabel}
                </span>
              </div>

              <p
                className={cn(
                  'mt-1 max-w-3xl leading-5 text-foreground/70',
                  isInline ? 'text-sm' : 'text-sm',
                )}
              >
                {description}
              </p>
            </div>
          </div>

          <div
            className={cn(
              'flex items-center gap-2',
              isInline ? 'pl-0' : 'pl-[3.25rem] lg:pl-0',
            )}
          >
            <Link
              href={ctaHref}
              className={cn(
                'inline-flex items-center justify-center text-sm font-semibold transition-colors',
                isInline ? 'h-9 rounded-lg px-3.5' : 'h-10 rounded-xl px-4',
                isCritical
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
                  : 'bg-warning text-warning-foreground hover:bg-warning/80',
              )}
            >
              {ctaLabel}
            </Link>

            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={handleDismiss}
              className={cn(
                'inline-flex items-center justify-center border transition-colors',
                isInline ? 'size-9 rounded-lg' : 'size-10 rounded-xl',
                isCritical
                  ? 'border-red-400/15 text-red-200 hover:bg-red-500/[0.12]'
                  : 'border-amber-400/15 text-amber-200 hover:bg-amber-500/[0.12]',
              )}
              ariaLabel="Dismiss low credits banner"
              icon={<X className="size-4" />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
