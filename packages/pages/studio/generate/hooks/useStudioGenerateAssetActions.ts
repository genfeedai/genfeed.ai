'use client';

import { IngredientFormat, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioGenerateJob } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import type { Ingredient } from '@genfeedai/models/content/ingredient.model';
import type { StudioGenerateAssetActions } from '@genfeedai/props/studio/studio-generate.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  useConfirmModal,
  useIngredientOverlay,
  usePostModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

export interface UseStudioGenerateAssetActionsParams {
  onAttachReference: (ingredient: IIngredient, type: 'image' | 'video') => void;
  onDeleted?: (id: string) => void;
  onRefresh: () => void;
}

/**
 * Studio adapter for the shared masonry action contract. The leaf components
 * keep ownership of transformations; this hook supplies the surrounding
 * product actions that need Studio state, global overlays, or a confirmation.
 */
export function useStudioGenerateAssetActions({
  onAttachReference,
  onDeleted,
  onRefresh,
}: UseStudioGenerateAssetActionsParams): StudioGenerateAssetActions {
  const translate = useTranslations('pages.studioGenerate');
  const router = useRouter();
  const { href } = useOrgUrl();
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { openConfirm } = useConfirmModal();
  const { openIngredientOverlay } = useIngredientOverlay();
  const { openPostBatchModal } = usePostModal({ onRefresh });
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const patchIngredient = useCallback(
    async (
      ingredient: IIngredient,
      patch: Partial<Ingredient>,
      actionLabel: string,
    ) => {
      try {
        const service = await getIngredientsService();
        await service.patch(ingredient.id, patch);
        onRefresh();
      } catch (error) {
        logger.error(`Failed to ${actionLabel} Studio asset`, error);
        notificationsService.error(`Failed to ${actionLabel} asset`);
      }
    },
    [getIngredientsService, notificationsService, onRefresh],
  );

  const onCopyPrompt = useCallback(
    async (ingredient: IIngredient) => {
      if (!ingredient.promptText) {
        notificationsService.info('No prompt to copy');
        return;
      }

      try {
        await clipboardService.copyToClipboard(ingredient.promptText);
        notificationsService.success('Prompt copied to clipboard');
      } catch (error) {
        logger.error('Failed to copy Studio asset prompt', error);
        notificationsService.error('Failed to copy prompt');
      }
    },
    [clipboardService, notificationsService],
  );

  const onToggleFavorite = useCallback(
    (ingredient: IIngredient) =>
      patchIngredient(
        ingredient,
        { isFavorite: !ingredient.isFavorite },
        'update favorite status for',
      ),
    [patchIngredient],
  );

  const changeStatus = useCallback(
    (
      ingredient: IIngredient,
      status: IngredientStatus,
      actionLabel: string,
    ) => {
      if (ingredient.status === status) {
        return Promise.resolve();
      }
      return patchIngredient(ingredient, { status }, actionLabel);
    },
    [patchIngredient],
  );

  const deletePersistedIngredient = useCallback(
    async (ingredientId: string, localJobId: string = ingredientId) => {
      try {
        const service = await getIngredientsService();
        const result = await service.bulkDelete({
          ids: [ingredientId],
          type: 'ingredients-delete',
        });

        if (!result.deleted.includes(ingredientId)) {
          throw new Error(
            result.message || `Ingredient ${ingredientId} was not deleted`,
          );
        }

        notificationsService.success(translate('movedToTrash'));
        onDeleted?.(localJobId);
        onRefresh();
      } catch (error) {
        logger.error('Failed to remove Studio generation', error);
        notificationsService.error(translate('removeFailed'));
      }
    },
    [
      getIngredientsService,
      notificationsService,
      onDeleted,
      onRefresh,
      translate,
    ],
  );

  const onDeleteIngredient = useCallback(
    (ingredient: IIngredient) => {
      openConfirm({
        confirmLabel: 'Delete',
        isError: true,
        label: 'Delete Ingredient',
        message: 'Move this ingredient to Trash? You can restore it later.',
        onConfirm: () =>
          deletePersistedIngredient(ingredient.id, ingredient.id),
      });
    },
    [deletePersistedIngredient, openConfirm],
  );

  const onRemoveGeneration = useCallback(
    (job: StudioGenerateJob) => {
      openConfirm({
        confirmLabel: translate('remove'),
        isError: true,
        label: translate('removeDialogTitle'),
        message: job.ingredientId
          ? translate('removePersistedMessage')
          : translate('removeLocalMessage'),
        onConfirm: async () => {
          if (job.ingredientId) {
            await deletePersistedIngredient(job.ingredientId, job.id);
            return;
          }

          onDeleted?.(job.id);
          notificationsService.success(translate('generationRemoved'));
        },
      });
    },
    [
      deletePersistedIngredient,
      notificationsService,
      onDeleted,
      openConfirm,
      translate,
    ],
  );

  const onSeeDetails = useCallback(
    (ingredient: IIngredient) => {
      openIngredientOverlay(ingredient, onRefresh);
    },
    [onRefresh, openIngredientOverlay],
  );

  return useMemo(
    () => ({
      onClickIngredient: onSeeDetails,
      onConvertToVideo: (ingredient: IIngredient) =>
        onAttachReference(ingredient, 'video'),
      onCopyPrompt,
      onCreateVariation: (ingredient: IIngredient) =>
        onAttachReference(ingredient, 'image'),
      onDeleteIngredient,
      onMarkArchived: (ingredient: IIngredient) =>
        changeStatus(ingredient, IngredientStatus.ARCHIVED, 'archive'),
      onMarkRejected: (ingredient: IIngredient) =>
        changeStatus(ingredient, IngredientStatus.REJECTED, 'reject'),
      onMarkValidated: (ingredient: IIngredient) =>
        changeStatus(ingredient, IngredientStatus.VALIDATED, 'validate'),
      onPublishIngredient: openPostBatchModal,
      onRefresh,
      onRemoveGeneration,
      onSeeDetails,
      onToggleFavorite,
      onUseAsVideoReference: (ingredient: IIngredient) =>
        router.push(
          href(
            `/studio/storyboard?mode=scenes&referenceImageId=${ingredient.id}&format=${ingredient.ingredientFormat || IngredientFormat.PORTRAIT}`,
          ),
        ),
    }),
    [
      changeStatus,
      onAttachReference,
      onCopyPrompt,
      onDeleteIngredient,
      onRefresh,
      onRemoveGeneration,
      onSeeDetails,
      onToggleFavorite,
      openPostBatchModal,
      href,
      router,
    ],
  );
}
