'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthorizedMediaPreview } from '@hooks/media/use-authorized-media-preview';
import { useRef, useState } from 'react';
import {
  resolveStudioAssetFacts,
  resolveStudioAssetUrl,
} from '@/features/studio/playground/utils/studio-playground-asset';
import type { StudioPlaygroundInspectorProps } from '@/features/studio/props/studio-playground.props';

interface UseStudioInspectorPreviewParams
  extends Pick<StudioPlaygroundInspectorProps, 'onPreviewRecovered'> {
  currentReceipt: IIngredient | null;
  ingredient: IIngredient | null;
  isOwnReceipt: (asset: IIngredient | undefined) => boolean;
  isReceiptReadEnabled: boolean;
  job: StudioPlaygroundJob;
  refetchReceipt: () => Promise<{
    data: IIngredient | undefined;
    isError: boolean;
  }>;
}

/**
 * What the Inspector previews and how a failed preview recovers: the
 * authorized media preview, the URL the asset renders from, the measured
 * dimensions for the facts list, and the retry that re-reads the receipt.
 * Every piece of state is scoped to the job, asset, brand and session, so a
 * different selection never inherits another's failure.
 */
export function useStudioInspectorPreview({
  currentReceipt,
  ingredient,
  isOwnReceipt,
  isReceiptReadEnabled,
  job,
  onPreviewRecovered,
  refetchReceipt,
}: UseStudioInspectorPreviewParams) {
  const { brandId } = useBrand();
  const { orgId, sessionId, userId } = useAuthIdentity();
  const previewScope = [
    job.id,
    job.ingredientId,
    brandId,
    orgId,
    sessionId,
    userId,
  ].join('\u0001');
  const [previewAttempt, setPreviewAttempt] = useState({
    scope: previewScope,
    revision: 0,
  });
  const previewRevision =
    previewAttempt.scope === previewScope ? previewAttempt.revision : 0;
  const [failedPreviewScope, setFailedPreviewScope] = useState<string | null>(
    null,
  );
  const [loadingPreviewScope, setLoadingPreviewScope] = useState<string | null>(
    null,
  );
  const [loadedMedia, setLoadedMedia] = useState<{
    height: number;
    scope: string;
    width: number;
  } | null>(null);
  const handleMediaMeasured = (width: number, height: number) => {
    if (width > 0 && height > 0) {
      setLoadedMedia({ height, scope: previewScope, width });
    }
  };
  const facts = resolveStudioAssetFacts(
    job,
    loadedMedia?.scope === previewScope ? loadedMedia : undefined,
  );
  const mediaPreview = useAuthorizedMediaPreview(ingredient, previewRevision);
  const isPreviewLoading =
    loadingPreviewScope === previewScope || mediaPreview?.state === 'PENDING';
  const hasPreviewError =
    failedPreviewScope === previewScope || mediaPreview?.state === 'FAILED';
  const isPreviewUnsupported = mediaPreview?.state === 'UNSUPPORTED';
  const previewUrl =
    isPreviewLoading || hasPreviewError || isPreviewUnsupported
      ? ''
      : mediaPreview
        ? (mediaPreview.url ?? '')
        : (resolveStudioAssetUrl(currentReceipt ?? ingredient) ??
          (job.ingredient ? '' : job.url));

  // Report each successful retry once, so the gallery card for the same asset
  // leaves its own "Preview unavailable" state instead of staying stale.
  const reportedRecoveryRef = useRef<string | null>(null);
  const handlePreviewLoaded = () => {
    if (previewRevision === 0 || !onPreviewRecovered) return;
    const recovery = `${previewScope}\u0001${previewRevision}`;
    if (reportedRecoveryRef.current === recovery) return;
    reportedRecoveryRef.current = recovery;
    onPreviewRecovered(
      job,
      ingredient?.mediaDelivery
        ? undefined
        : resolveStudioAssetUrl(currentReceipt),
    );
  };

  const previewScopeRef = useRef(previewScope);
  previewScopeRef.current = previewScope;
  const handleRetryPreview = () => {
    if (!ingredient || isPreviewLoading || isPreviewUnsupported) return;
    setFailedPreviewScope(null);
    setPreviewAttempt({ scope: previewScope, revision: previewRevision + 1 });
    // Legacy media refreshes through its category read; signed delivery uses
    // the existing grant endpoint. Neither path starts or retries a generation.
    if (ingredient.mediaDelivery || !isReceiptReadEnabled) return;
    const retryScope = previewScope;
    setLoadingPreviewScope(retryScope);
    void refetchReceipt().then((result) => {
      setLoadingPreviewScope((current) =>
        current === retryScope ? null : current,
      );
      // A retry superseded by another selection never touches its preview.
      if (previewScopeRef.current !== retryScope) return;
      setFailedPreviewScope(
        result.isError || !isOwnReceipt(result.data) ? retryScope : null,
      );
    });
  };

  return {
    facts,
    handleMediaMeasured,
    handlePreviewFailed: () => setFailedPreviewScope(previewScope),
    handlePreviewLoaded,
    handleRetryPreview,
    hasPreviewError,
    isPreviewLoading,
    isPreviewUnsupported,
    previewRevision,
    previewScope,
    previewUrl,
  };
}
