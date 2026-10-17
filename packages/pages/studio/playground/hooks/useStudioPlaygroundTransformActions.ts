import { ModelCategory } from '@genfeedai/contracts';
import { isImageEditModel } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { getModelCapability } from '@genfeedai/helpers/model-capability.helper';
import type {
  IngredientActionAvailability,
  IngredientContinuationOperation,
  MasonryTransformActions,
} from '@genfeedai/props/content/masonry.props';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import { useElements } from '@hooks/data/elements/use-elements/use-elements';
import { useIngredientActions } from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import {
  isStudioImageContinuationSource,
  isStudioTransformSource,
} from '@pages/studio/playground/utils/studio-playground-asset';
import { useCallback, useMemo } from 'react';

export interface UseStudioPlaygroundTransformActionsParams {
  brandId: string | undefined;
  organizationId: string | undefined;
  onRefresh: () => void | Promise<void>;
  scopeKey: string;
}

export function useStudioPlaygroundTransformActions({
  brandId,
  organizationId,
  onRefresh,
  scopeKey,
}: UseStudioPlaygroundTransformActionsParams) {
  const controller = useIngredientActions({ onRefresh, scopeKey });
  const { imageModels, imageEditModels, videoModels, isLoading } =
    useElements();
  const { getUpscaleAvailability, getExtendAvailability } = controller;
  const getAvailability = useCallback(
    (
      ingredient: IIngredient,
      operation: IngredientContinuationOperation,
    ): IngredientActionAvailability => {
      if (!isStudioTransformSource(ingredient, brandId, organizationId))
        return { isAvailable: false, reason: 'sourceUnavailable' };
      if (operation === 'editor')
        return {
          isAvailable: isVideoIngredient(ingredient),
          reason: isVideoIngredient(ingredient)
            ? undefined
            : 'sourceUnavailable',
        };
      if (isLoading) return { isAvailable: false, reason: 'catalogLoading' };
      if (operation === 'upscale') return getUpscaleAvailability(ingredient);
      if (operation === 'extend') return getExtendAvailability(ingredient);
      if (!isStudioImageContinuationSource(ingredient, brandId, organizationId))
        return { isAvailable: false, reason: 'sourceUnavailable' };
      const supported =
        operation === 'edit'
          ? imageEditModels.some((model) => isImageEditModel(model.key))
          : (operation === 'animate' ? videoModels : imageModels).some(
              (model) => {
                const capability = getModelCapability(model);
                return (
                  capability?.category ===
                    (operation === 'animate'
                      ? ModelCategory.VIDEO
                      : ModelCategory.IMAGE) && capability.maxReferences > 0
                );
              },
            );
      return supported
        ? { isAvailable: true }
        : { isAvailable: false, reason: 'modelUnavailable' };
    },
    [
      brandId,
      organizationId,
      isLoading,
      imageEditModels,
      imageModels,
      videoModels,
      getUpscaleAvailability,
      getExtendAvailability,
    ],
  );
  const onUpscale = useCallback(
    async (ingredient: IIngredient) => {
      if (isStudioTransformSource(ingredient, brandId, organizationId))
        await controller.handlers.handleUpscale(ingredient);
    },
    [brandId, organizationId, controller.handlers.handleUpscale],
  );
  const onExtend = useCallback(
    (ingredient: IIngredient) => {
      if (isStudioTransformSource(ingredient, brandId, organizationId))
        controller.handlers.handleExtend(ingredient);
    },
    [brandId, organizationId, controller.handlers.handleExtend],
  );
  const transformActions: MasonryTransformActions = useMemo(
    () => ({
      getAvailability,
      onUpscale,
      onExtend,
      isUpscaling: controller.actionStates.isUpscaling,
      isExtending: controller.actionStates.isExtending,
    }),
    [
      getAvailability,
      onUpscale,
      onExtend,
      controller.actionStates.isUpscaling,
      controller.actionStates.isExtending,
    ],
  );
  return {
    transformActions,
    confirmation: {
      upscaleConfirmData: controller.upscaleConfirmData,
      executeUpscale: controller.executeUpscale,
      clearUpscaleConfirm: controller.clearUpscaleConfirm,
      extendConfirmData: controller.extendConfirmData,
      executeExtend: controller.executeExtend,
      clearExtendConfirm: controller.clearExtendConfirm,
    },
  };
}
