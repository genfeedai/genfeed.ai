'use client';

import type { IIngredient } from '@cloud/interfaces';
import { IngredientFormat, IngredientStatus } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  UseAssetActionsParams,
  UseAssetActionsReturn,
} from '@pages/studio/generate/types';
import { buildRepromptData } from '@pages/studio/generate/utils/generation-payloads';
import {
  useIngredientOverlay,
  usePostModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

export function useAssetActions({
  allAssets,
  brandId,
  categoryType,
  currentModels,
  currentPage,
  findAllAssets,
  handleGenerateSubmit,
  setSelectedAsset,
}: UseAssetActionsParams): UseAssetActionsReturn {
  const router = useRouter();
  const { href } = useOrgUrl();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);

  const { openPostBatchModal } = usePostModal({
    onRefresh: () => findAllAssets(1, false, true),
  });
  const { openIngredientOverlay } = useIngredientOverlay();

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const handleIngredientClick = useCallback(
    (ingredient: IIngredient) => {
      if (!ingredient) {
        return;
      }
      setSelectedAsset(ingredient);
      const index = allAssets.findIndex((asset) => asset.id === ingredient.id);
      if (index !== -1) {
        setLightboxIndex(index);
        setLightboxOpen(true);
      }
    },
    [allAssets, setSelectedAsset],
  );

  const handleSeeDetails = useCallback(
    (ingredient: IIngredient) => {
      if (!ingredient) {
        return;
      }
      setSelectedAsset(ingredient);
      openIngredientOverlay(ingredient);
    },
    [openIngredientOverlay, setSelectedAsset],
  );

  const handleCopy = useCallback(
    (item: IIngredient) => {
      if (item?.promptText) {
        clipboardService.copyToClipboard(item.promptText);
        notificationsService.success('Prompt copied to clipboard');
      } else {
        notificationsService.info('No prompt to copy');
      }
    },
    [clipboardService, notificationsService],
  );

  const handleReprompt = useCallback(
    async (ingredient: IIngredient) => {
      if (!ingredient?.promptText) {
        return notificationsService.error('No prompt found to reprompt');
      }

      const repromptData = buildRepromptData(
        ingredient,
        categoryType,
        brandId,
        currentModels,
      );

      if (!repromptData.models?.[0]) {
        return notificationsService.error('No model found for reprompt');
      }

      await handleGenerateSubmit(repromptData);
    },
    [
      notificationsService,
      currentModels,
      categoryType,
      brandId,
      handleGenerateSubmit,
    ],
  );

  const handleEditIngredient = useCallback(
    (ingredient: IIngredient) => {
      if (!ingredient?.id) {
        return;
      }
      setSelectedAsset(ingredient);
      router.push(href(`/studio/${ingredient.category}/${ingredient.id}`));
    },
    [router, setSelectedAsset],
  );

  const navigateWithImageReference = useCallback(
    (ingredient: IIngredient, targetCategory: 'video' | 'image') => {
      if (!ingredient) {
        return;
      }
      if (ingredient.status === IngredientStatus.PROCESSING) {
        return notificationsService.info(
          'Please wait until the image has finished processing',
        );
      }
      const format = ingredient.ingredientFormat || IngredientFormat.PORTRAIT;
      router.push(
        href(
          `/studio/${targetCategory}?referenceImageId=${ingredient.id}&format=${format}`,
        ),
      );
    },
    [notificationsService, router],
  );

  const handleConvertImageToVideo = useCallback(
    (ingredient: IIngredient) =>
      navigateWithImageReference(ingredient, 'video'),
    [navigateWithImageReference],
  );

  const handleCreateVariation = useCallback(
    (ingredient: IIngredient) =>
      navigateWithImageReference(ingredient, 'image'),
    [navigateWithImageReference],
  );

  const handleToggleFavorite = useCallback(
    async (item: IIngredient) => {
      try {
        const service = await getIngredientsService();
        await service.patch(item.id, { isFavorite: !item.isFavorite });
        await findAllAssets(currentPage, false, true);
      } catch (error) {
        logger.error('Failed to toggle favorite', error);
        notificationsService.error('Failed to update favorite status');
      }
    },
    [findAllAssets, currentPage, getIngredientsService, notificationsService],
  );

  const handleMarkValidated = useCallback(
    async (item: IIngredient) => {
      if (item.status === IngredientStatus.VALIDATED) {
        return;
      }

      try {
        const service = await getIngredientsService();
        await service.patch(item.id, { status: IngredientStatus.VALIDATED });
        const completeIngredient = await service.findOne(item.id);
        openPostBatchModal(completeIngredient);
      } catch (error) {
        logger.error('Failed to mark as validated', error);
        notificationsService.error('Failed to mark as validated');
      }
    },
    [getIngredientsService, openPostBatchModal, notificationsService],
  );

  const updateIngredientStatus = useCallback(
    async (
      item: IIngredient,
      targetStatus: IngredientStatus,
      actionLabel: string,
    ) => {
      if (item.status === targetStatus) {
        return;
      }

      try {
        const service = await getIngredientsService();
        await service.patch(item.id, { status: targetStatus });
        await findAllAssets(1, false, true);
      } catch (error) {
        logger.error(`Failed to ${actionLabel} asset`, error);
        notificationsService.error(`Failed to ${actionLabel} asset`);
      }
    },
    [findAllAssets, getIngredientsService, notificationsService],
  );

  const handleMarkRejected = useCallback(
    (item: IIngredient) =>
      updateIngredientStatus(item, IngredientStatus.REJECTED, 'reject'),
    [updateIngredientStatus],
  );

  const handleMarkArchived = useCallback(
    (item: IIngredient) =>
      updateIngredientStatus(item, IngredientStatus.ARCHIVED, 'archive'),
    [updateIngredientStatus],
  );

  const handlePublishIngredient = useCallback(
    (ingredient: IIngredient) => {
      if (!ingredient) {
        return;
      }
      openPostBatchModal(ingredient);
    },
    [openPostBatchModal],
  );

  return {
    handleConvertImageToVideo,
    handleCopy,
    handleCreateVariation,
    handleEditIngredient,
    handleIngredientClick,
    handleMarkArchived,
    handleMarkRejected,
    handleMarkValidated,
    handlePublishIngredient,
    handleReprompt,
    handleSeeDetails,
    handleToggleFavorite,
    lightboxIndex,
    lightboxOpen,
    setLightboxIndex,
    setLightboxOpen,
  };
}
