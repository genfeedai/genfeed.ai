'use client';

import type { ContentMentionItem } from '@genfeedai/agent/types/mention.types';
import {
  hasAudioReferences,
  LIBRARY_ASSETS_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { useCallback, useEffect, useMemo } from 'react';
import { useStudioAudioLibrary } from '@/features/studio/playground/hooks/useStudioAudioLibrary';
import type { UseStudioGenerationReturn } from '@/features/studio/playground/hooks/useStudioGeneration';
import { useStudioJobSelection } from '@/features/studio/playground/hooks/useStudioJobSelection';
import { useStudioPendingPreviews } from '@/features/studio/playground/hooks/useStudioPendingPreviews';
import type { UseStudioPlaygroundGalleryReturn } from '@/features/studio/playground/hooks/useStudioPlaygroundGallery';
import { useStudioPlaygroundPreviewRecovery } from '@/features/studio/playground/hooks/useStudioPlaygroundPreviewRecovery';
import { useStudioResultsFilters } from '@/features/studio/playground/hooks/useStudioResultsFilters';
import {
  mergeStudioPlaygroundJobs,
  studioJobToContentMention,
} from '@/features/studio/playground/utils/studio-playground-asset';
import { filterStudioReferenceLibrary } from '@/features/studio/playground/utils/studio-reference-selection';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';
import { useFailedIngredientRecovery } from '@/hooks/data/ingredients/use-ingredients-list/use-failed-ingredient-recovery';

export interface UseStudioGalleryViewParams
  extends Pick<
    StudioWorkspaceScope,
    'brandId' | 'getIngredientsService' | 'organizationId' | 'settings' | 'type'
  > {
  contentLibraryRole: StudioPlaygroundReferenceRole;
  galleryError: UseStudioPlaygroundGalleryReturn['galleryError'];
  isContentLibraryOpen: boolean;
  isLoadingGallery: boolean;
  jobs: UseStudioGenerationReturn['jobs'];
  mentions: ContentMentionItem[];
  refresh: UseStudioPlaygroundGalleryReturn['refresh'];
  rehydratePending: UseStudioGenerationReturn['rehydratePending'];
  storedJobs: UseStudioPlaygroundGalleryReturn['storedJobs'];
}

/**
 * The gallery the playground shows: live and stored jobs merged, filtered and
 * searched, the selected job and its run, preview recovery, failed-asset
 * recovery and the Library items a reference can be picked from.
 */
export function useStudioGalleryView({
  brandId,
  contentLibraryRole,
  galleryError,
  getIngredientsService,
  isContentLibraryOpen,
  isLoadingGallery,
  jobs,
  mentions,
  organizationId,
  refresh,
  rehydratePending,
  settings,
  storedJobs,
  type,
}: UseStudioGalleryViewParams) {
  useEffect(() => {
    rehydratePending(storedJobs);
  }, [rehydratePending, storedJobs]);

  const galleryJobs = useMemo(
    () => mergeStudioPlaygroundJobs(jobs, storedJobs),
    [jobs, storedJobs],
  );
  const persistedRecoveryIngredients = useMemo(
    () => [
      ...new Map(
        galleryJobs.flatMap((job) =>
          job.ingredient &&
          job.id === job.ingredient.id &&
          job.ingredientId === job.ingredient.id &&
          job.ingredient.brandId === brandId &&
          !job.ingredient.isDeleted
            ? [[job.ingredient.id, job.ingredient] as const]
            : [],
        ),
      ).values(),
    ],
    [brandId, galleryJobs],
  );
  const refreshRecovery = useCallback(async () => {
    await refresh();
    window.dispatchEvent(new Event(LIBRARY_ASSETS_REFRESH_EVENT));
  }, [refresh]);
  const failedRecovery = useFailedIngredientRecovery({
    ingredients: persistedRecoveryIngredients,
    scopeKey: `${organizationId}:${brandId}`,
    brandId,
    onRefresh: refreshRecovery,
  });
  const audioLibrary = useStudioAudioLibrary(
    isContentLibraryOpen &&
      contentLibraryRole === 'audioReference' &&
      type === 'video' &&
      hasAudioReferences(settings.modelKey),
  );
  const contentLibraryItems = useMemo(() => {
    const generated = galleryJobs.flatMap((job) => {
      const item = studioJobToContentMention(job, contentLibraryRole);
      return item ? [item] : [];
    });
    const seen = new Set(generated.map((item) => item.id));

    const libraryItems =
      contentLibraryRole === 'audioReference' ? audioLibrary.items : mentions;
    return filterStudioReferenceLibrary(
      [...generated, ...libraryItems.filter((item) => !seen.has(item.id))],
      contentLibraryRole,
    );
  }, [audioLibrary.items, contentLibraryRole, galleryJobs, mentions]);
  const {
    clearFilters,
    resultSort,
    resultType,
    resultsView,
    search,
    setResultSort,
    setResultType,
    setResultsView,
    setSearch,
    visibleJobs,
  } = useStudioResultsFilters(galleryJobs);
  const {
    selectedJob,
    selectedJobId,
    selectedParentJob,
    selectedRunJobs,
    setSelectedJobId,
  } = useStudioJobSelection(visibleJobs);
  const { previewRevisions, recoverPreview, recoveredJobs } =
    useStudioPlaygroundPreviewRecovery(visibleJobs);
  useStudioPendingPreviews({
    getIngredientsService,
    jobs: visibleJobs,
    recoverPreview,
  });
  // Like the agent's new conversation, the cards stay up while a prompt is
  // being written or seeded: they leave only when there is something to show.
  const showEmptyState =
    !galleryError && !isLoadingGallery && galleryJobs.length === 0;
  return {
    audioLibrary,
    clearFilters,
    contentLibraryItems,
    failedRecovery,
    galleryJobs,
    previewRevisions,
    recoverPreview,
    recoveredJobs,
    resultSort,
    resultType,
    resultsView,
    search,
    selectedJob,
    selectedJobId,
    selectedParentJob,
    selectedRunJobs,
    setResultSort,
    setResultType,
    setResultsView,
    setSearch,
    setSelectedJobId,
    showEmptyState,
    visibleJobs,
  };
}

export type UseStudioGalleryViewReturn = ReturnType<
  typeof useStudioGalleryView
>;
