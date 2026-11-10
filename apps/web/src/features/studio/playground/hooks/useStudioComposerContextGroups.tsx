'use client';

import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { ImageIcon, ImagePlus, Sparkles, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { useStudioAssetActions } from '@/features/studio/playground/hooks/useStudioAssetActions';
import { studioJobToContentMention } from '@/features/studio/playground/utils/studio-playground-asset';
import { studioAssetAccessibleLabel } from '@/features/studio/playground/utils/studio-playground-recipe';
import type { PromptBarContextItem } from '@/features/studio/props/prompt-bar-context-row.props';
import type { StudioWorkspaceScope } from '@/features/studio/props/studio-playground-workspace.props';

/** Recent images offered as "More like" in the composer while it is empty. */
const COMPOSER_RECENT_LIMIT = 4;

export interface UseStudioComposerContextGroupsParams
  extends Pick<StudioWorkspaceScope, 'translate' | 'type'> {
  assetActions: ReturnType<typeof useStudioAssetActions>['assetActions'];
  canUseGeneratedReference: (job: StudioPlaygroundJob) => boolean;
  handleCloseInspector: () => void;
  handleOpenFocusedPreview: () => void;
  handleRemixJob: (job: StudioPlaygroundJob) => void;
  handleUseGeneratedReference: (job: StudioPlaygroundJob) => void;
  isFocusedPreview: boolean;
  selectedJob: StudioPlaygroundJob | null | undefined;
  visibleJobs: readonly StudioPlaygroundJob[];
}

/**
 * The context chips above the composer: the selected asset with its quick
 * actions, and recent images offered as "More like".
 */
export function useStudioComposerContextGroups({
  assetActions,
  canUseGeneratedReference,
  handleCloseInspector,
  handleOpenFocusedPreview,
  handleRemixJob,
  handleUseGeneratedReference,
  isFocusedPreview,
  selectedJob,
  translate,
  type,
  visibleJobs,
}: UseStudioComposerContextGroupsParams) {
  const translateInspectorActions = useTranslations(
    'common.videoCreativeActions.inspector',
  );
  return useMemo(() => {
    const selection: PromptBarContextItem[] = [];
    if (selectedJob && !isFocusedPreview) {
      const mention = studioJobToContentMention(selectedJob);
      const isImage = selectedJob.type === 'image' && selectedJob.ingredient;
      selection.push({
        icon: <ImageIcon className="size-3.5" />,
        id: `selected-${selectedJob.id}`,
        isIconOnly: Boolean(mention?.thumbnailUrl && isImage),
        label: studioAssetAccessibleLabel(selectedJob),
        onRemove: handleCloseInspector,
        onSelect: handleOpenFocusedPreview,
        removeLabel: translate('composerContext.clearSelection'),
        thumbnailUrl: isImage ? mention?.thumbnailUrl : undefined,
      });
      if (isImage && selectedJob.ingredient) {
        const ingredient = selectedJob.ingredient;
        selection.push(
          {
            icon: <Sparkles className="size-3.5" />,
            id: 'variation',
            label: translateInspectorActions('createVariation'),
            onSelect: () => handleRemixJob(selectedJob),
          },
          {
            icon: <Video className="size-3.5" />,
            id: 'animate',
            label: translateInspectorActions('animate'),
            onSelect: () => assetActions.onConvertToVideo(ingredient),
          },
        );
      }
      if (canUseGeneratedReference(selectedJob)) {
        selection.push({
          icon: <ImagePlus className="size-3.5" />,
          id: 'reference',
          label: translate('useAsReference'),
          onSelect: () => handleUseGeneratedReference(selectedJob),
        });
      }
    }
    const recent: PromptBarContextItem[] =
      type === 'image'
        ? visibleJobs
            .flatMap((job) => {
              if (job.type !== 'image' || !job.ingredient) return [];
              const thumbnailUrl = studioJobToContentMention(job)?.thumbnailUrl;
              return thumbnailUrl ? [{ job, thumbnailUrl }] : [];
            })
            .slice(0, COMPOSER_RECENT_LIMIT)
            .map(({ job, thumbnailUrl }) => ({
              ariaLabel: translate('composerContext.moreLikeAria', {
                name: studioAssetAccessibleLabel(job),
              }),
              id: `recent-${job.id}`,
              isIconOnly: true,
              label: studioAssetAccessibleLabel(job),
              onSelect: () => handleRemixJob(job),
              thumbnailUrl,
            }))
        : [];
    return {
      recent: {
        id: 'recent',
        items: recent,
        label: translate('composerContext.moreLike'),
      },
      selection: selection.length
        ? { id: 'selection', items: selection }
        : undefined,
    };
  }, [
    assetActions,
    canUseGeneratedReference,
    handleCloseInspector,
    handleOpenFocusedPreview,
    handleRemixJob,
    handleUseGeneratedReference,
    isFocusedPreview,
    selectedJob,
    translate,
    translateInspectorActions,
    type,
    visibleJobs,
  ]);
}
