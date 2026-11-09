'use client';

import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useCallback } from 'react';
import type { UseStudioGenerationReturn } from '@/features/studio/playground/hooks/useStudioGeneration';
import { useStudioPlaygroundAssetActions } from '@/features/studio/playground/hooks/useStudioPlaygroundAssetActions';
import type { UseStudioPlaygroundGalleryReturn } from '@/features/studio/playground/hooks/useStudioPlaygroundGallery';
import { useStudioPlaygroundTransformActions } from '@/features/studio/playground/hooks/useStudioPlaygroundTransformActions';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';
import type { useFailedIngredientRecovery } from '@/hooks/data/ingredients/use-ingredients-list/use-failed-ingredient-recovery';

export interface UseStudioAssetActionsParams
  extends Pick<StudioWorkspaceScope, 'brandId' | 'organizationId'> {
  crunRestoreScope: string;
  failedRecovery: ReturnType<typeof useFailedIngredientRecovery>;
  handleAttachGeneratedReference: (
    ingredient: IIngredient,
    targetType: 'image' | 'video',
  ) => void;
  refresh: UseStudioPlaygroundGalleryReturn['refresh'];
  removeJob: UseStudioGenerationReturn['removeJob'];
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;
  visibleJobs: readonly StudioPlaygroundJob[];
}

/** Per-asset actions (transform, recover, publish, inspect) for the gallery. */
export function useStudioAssetActions({
  brandId,
  crunRestoreScope,
  failedRecovery,
  handleAttachGeneratedReference,
  organizationId,
  refresh,
  removeJob,
  selectedJobId,
  setSelectedJobId,
  visibleJobs,
}: UseStudioAssetActionsParams) {
  const revealInspector = useContextSidebar()?.reveal;
  const handleInspectIngredient = useCallback(
    (ingredient: IIngredient) => {
      const job = visibleJobs.find(
        (candidate) =>
          candidate.ingredientId === ingredient.id ||
          candidate.ingredient?.id === ingredient.id,
      );
      if (job) {
        setSelectedJobId(job.id);
        if (job.id === selectedJobId) revealInspector?.();
      }
    },
    [revealInspector, selectedJobId, visibleJobs, setSelectedJobId],
  );
  const { transformActions, confirmation: transformConfirmation } =
    useStudioPlaygroundTransformActions({
      brandId,
      organizationId,
      onRefresh: refresh,
      scopeKey: crunRestoreScope,
    });
  const assetActions = useStudioPlaygroundAssetActions({
    transformActions,
    failedRecovery: {
      onRetryFailedIngredient: (ingredient) =>
        failedRecovery.handleRetryFailedIngredients([ingredient]),
      onReviewFailedIngredient: failedRecovery.handleReviewFailedIngredient,
      isRecovering: failedRecovery.isRecovering,
      retriedIds: failedRecovery.retriedIds,
    },
    onAttachReference: handleAttachGeneratedReference,
    onDeleted: removeJob,
    onInspectIngredient: handleInspectIngredient,
    onRefresh: refresh,
  });
  return {
    assetActions,
    revealInspector,
    transformActions,
    transformConfirmation,
  };
}

export type UseStudioAssetActionsReturn = ReturnType<
  typeof useStudioAssetActions
>;
