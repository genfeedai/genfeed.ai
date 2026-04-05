'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiExclamationTriangle, HiXMark } from 'react-icons/hi2';

const LOW_CREDITS_THRESHOLD = 1000;
const DISMISS_KEY = 'genfeed:low-credits-dismissed';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DismissState {
  balance: number;
  timestamp: number;
}

interface LowCreditsBannerProps {
  variant?: 'inline' | 'shell';
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

  if (balance !== null && dismissState.balance > 0 && balance === 0) {
    return false;
  }

  return true;
}

export default function LowCreditsBanner({
  variant = 'shell',
}: LowCreditsBannerProps) {
  const { creditsBreakdown } = useSubscription();
  const { orgHref } = useOrgUrl();
  const balance = creditsBreakdown?.total ?? null;
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
  const description = isCritical
    ? 'Top up your balance to keep generating content, running workflows, and using your organization tools without interruption.'
    : 'Your current balance is getting tight. Top up now so active generations and automations do not get blocked later.';
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
            : 'max-w-6xl rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)]',
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
                isInline ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl',
                isCritical
                  ? 'border-red-400/25 bg-red-500/[0.12] text-red-300'
                  : 'border-amber-400/25 bg-amber-500/[0.12] text-amber-300',
              )}
            >
              <HiExclamationTriangle className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold leading-5 text-foreground">
                  {title}
                </p>
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
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
                  isInline ? 'text-[13px]' : 'text-sm',
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
              href={orgHref('/settings/organization/billing')}
              className={cn(
                'inline-flex items-center justify-center text-sm font-semibold transition-colors',
                isInline ? 'h-9 rounded-lg px-3.5' : 'h-10 rounded-xl px-4',
                isCritical
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-amber-500 text-black hover:bg-amber-400',
              )}
            >
              Top up credits
            </Link>

            <button
              type="button"
              onClick={handleDismiss}
              className={cn(
                'inline-flex items-center justify-center border transition-colors',
                isInline ? 'h-9 w-9 rounded-lg' : 'h-10 w-10 rounded-xl',
                isCritical
                  ? 'border-red-400/15 text-red-200 hover:bg-red-500/[0.12]'
                  : 'border-amber-400/15 text-amber-200 hover:bg-amber-500/[0.12]',
              )}
              aria-label="Dismiss low credits banner"
            >
              <HiXMark className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
