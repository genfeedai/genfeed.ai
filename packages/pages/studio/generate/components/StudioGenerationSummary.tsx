'use client';

import { shouldShowCreditsNav } from '@genfeedai/config/license';
import {
  APP_ROUTES,
  formatCreditBalanceExact,
} from '@genfeedai/contracts/constants';
import { getVideoResolutionLabel } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import { useTopbarBalances } from '@genfeedai/hooks/data/billing/use-topbar-balances/use-topbar-balances';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import { useDesktopRuntimeContext } from '@genfeedai/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import type { StudioGenerationSummaryProps } from '@genfeedai/props/studio/studio-generate.props';
import {
  canSubmitStudioGeneration,
  getDesktopCreditsVisibility,
} from '@genfeedai/services/core/desktop-runtime.service';
import { buildStudioPromptData } from '@pages/studio/generate/utils/studio-generate-settings';
import { resolveStudioGenerateCapabilities } from '@pages/studio/generate/utils/studio-generate-types';
import { isAutoGenerationModelKey } from '@ui/dropdowns/model-selector/model-selector.constants';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function StudioGenerationSummary({
  estimate,
  isLoadingModels,
  model,
  settings,
  type,
}: StudioGenerationSummaryProps) {
  const translate = useTranslations('pages.studioGenerate');
  const { orgHref } = useOrgUrl();
  const { genfeedBalance, isLoaded, isLoading } = useTopbarBalances();
  const runtime = useDesktopRuntimeContext();
  const showCredits = shouldShowCreditsNav(
    getDesktopCreditsVisibility(runtime),
  );
  const capabilities = resolveStudioGenerateCapabilities(
    type,
    settings.modelKey,
  );
  const promptData = buildStudioPromptData({
    brandId: '',
    promptText: '',
    settings,
    type,
  });
  const modelLabel = !capabilities.hasModelSelection
    ? undefined
    : isLoadingModels
      ? translate('summary.modelLoading')
      : isAutoGenerationModelKey(settings.modelKey)
        ? translate('inspector.autoModel')
        : model?.label || translate('summary.modelUnavailable');
  const resolutionLabel =
    type === 'video' && promptData.resolution
      ? (getVideoResolutionLabel(settings.modelKey, promptData.resolution) ??
        promptData.resolution)
      : promptData.resolution;
  const setupParts = [
    modelLabel,
    capabilities.hasAspectRatio ? settings.aspectRatio : undefined,
    type === 'image' || type === 'video' ? resolutionLabel : undefined,
    capabilities.hasDuration && promptData.duration
      ? translate('inspector.durationSeconds', { seconds: promptData.duration })
      : undefined,
    capabilities.hasOutputs
      ? translate('summary.outputs', { count: promptData.outputs ?? 1 })
      : undefined,
  ].filter(Boolean);
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
  const estimateLabel = !canSubmitStudioGeneration(runtime)
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
          : translate('summary.estimateUnavailable');

  return (
    <div
      className="mt-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground"
      data-testid="studio-generation-summary"
    >
      <div
        role="group"
        className="min-w-0 break-words"
        aria-label={translate('summary.setup')}
      >
        {setupParts.join(' · ')}
      </div>
      {showCredits ? (
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums"
        >
          <span>{estimateLabel}</span>
          <Link
            className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={orgHref(APP_ROUTES.SETTINGS.CREDITS)}
          >
            {balanceLabel}
          </Link>
        </div>
      ) : runtime.status !== 'web' ? (
        <span role="status">
          {runtime.status === 'ready' &&
          runtime.context?.runtimeMode === 'local'
            ? translate('summary.serverRequired')
            : runtime.status === 'loading' || runtime.status === 'switching'
              ? translate('summary.costContextLoading')
              : translate('summary.costContextUnavailable')}
        </span>
      ) : null}
    </div>
  );
}
