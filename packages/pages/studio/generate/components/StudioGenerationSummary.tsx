'use client';

import { shouldShowCreditsNav } from '@genfeedai/config/license';
import { formatCreditBalanceExact } from '@genfeedai/contracts/constants';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useDesktopRuntimeContext } from '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import type { StudioGenerationSummaryProps } from '@genfeedai/props/studio/studio-generate.props';
import {
  canSubmitStudioGeneration,
  getDesktopCreditsVisibility,
} from '@genfeedai/services/core/desktop-runtime.service';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/primitives/tooltip';
import { useTranslations } from 'next-intl';

export default function StudioGenerationSummary({
  children,
  isDisabled = false,
  label,
  estimate,
  crunQuote,
  model,
  type,
}: StudioGenerationSummaryProps) {
  const translate = useTranslations('pages.studioGenerate');
  const { genfeedBalance, isLoaded, isLoading } = useTopbarBalances();
  const runtime = useDesktopRuntimeContext();
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );
  const balance =
    isLoaded &&
    typeof genfeedBalance === 'number' &&
    Number.isFinite(genfeedBalance)
      ? genfeedBalance
      : null;
  const balanceLabel =
    balance !== null
      ? translate('summary.availableCredits', {
          credits: formatCreditBalanceExact(balance),
        })
      : isLoading
        ? translate('summary.balanceLoading')
        : translate('summary.balanceUnavailable');
  const estimateLabel =
    model?.provider === 'crun'
      ? crunQuote?.quote?.isAvailable
        ? crunQuote.quote.billingMode === 'byok'
          ? translate('crun.byok')
          : translate('crun.credits', { credits: crunQuote.quote.credits })
        : crunQuote?.status === 'pending'
          ? translate('crun.quoteLoading')
          : crunQuote?.reasonCode
            ? translate(
                `crun.${type === 'video' ? 'videoReasons' : 'reasons'}.${crunQuote.reasonCode}`,
              )
            : translate(
                type === 'video'
                  ? 'crun.videoQuoteUnavailable'
                  : 'crun.quoteUnavailable',
              )
      : !canSubmitStudioGeneration(runtime)
        ? translate(
            runtime.status === 'loading' || runtime.status === 'switching'
              ? 'summary.costContextLoading'
              : 'summary.costContextUnavailable',
          )
        : estimate.status === 'estimated' &&
            estimate.credits !== null &&
            canSubmitStudioGeneration(runtime)
          ? translate('estimatedCredits', {
              credits: formatCreditBalanceExact(estimate.credits),
            })
          : estimate.status === 'auto'
            ? translate('summary.estimateAfterSelection')
            : estimate.status === 'loading'
              ? translate('summary.estimateLoading')
              : estimate.unavailableReason
                ? translate(
                    `summary.estimateReasons.${estimate.unavailableReason}`,
                  )
                : translate('summary.estimateUnavailable');

  const quotedCredits =
    model?.provider === 'crun' && crunQuote?.quote?.isAvailable
      ? crunQuote.quote.billingMode === 'byok'
        ? null
        : crunQuote.quote.credits
      : estimate.status === 'estimated'
        ? estimate.credits
        : null;
  const compactEstimate =
    model?.provider === 'crun' &&
    crunQuote?.quote?.isAvailable &&
    crunQuote.quote.billingMode === 'byok'
      ? translate('crun.byok')
      : canSubmitStudioGeneration(runtime) &&
          quotedCredits !== null &&
          quotedCredits !== undefined
        ? `~${formatCreditBalanceExact(quotedCredits)}`
        : estimate.status === 'loading' || crunQuote?.status === 'pending'
          ? '…'
          : estimate.status === 'auto'
            ? translate('inspector.autoModel')
            : '—';
  const compactBalance =
    balance !== null
      ? formatCreditBalanceExact(balance)
      : isLoading
        ? '…'
        : '—';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {isDisabled ? (
            <span
              role="group"
              aria-label={label}
              className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {children}
            </span>
          ) : (
            children
          )}
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          avoidCollisions={false}
          className="flex flex-col gap-1.5"
        >
          <span>{label}</span>
          <div
            className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-muted-foreground"
            data-testid="studio-generation-summary"
          >
            {showCredits ? (
              <div className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                <span
                  role="status"
                  aria-label={estimateLabel}
                  title={estimateLabel}
                >
                  {compactEstimate === '…' || compactEstimate === '—'
                    ? estimateLabel
                    : compactEstimate}
                </span>
                <span aria-hidden="true">/</span>
                <span
                  role="status"
                  aria-label={balanceLabel}
                  title={balanceLabel}
                >
                  {compactBalance}
                </span>
              </div>
            ) : runtime.status !== 'web' ? (
              <span role="status">
                {runtime.status === 'ready' &&
                runtime.context?.runtimeMode === 'local'
                  ? translate('summary.serverRequired')
                  : runtime.status === 'loading' ||
                      runtime.status === 'switching'
                    ? translate('summary.costContextLoading')
                    : translate('summary.costContextUnavailable')}
              </span>
            ) : null}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
