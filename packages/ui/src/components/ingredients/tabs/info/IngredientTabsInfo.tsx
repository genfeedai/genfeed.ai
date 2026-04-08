'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientCategory } from '@genfeedai/enums';
import type { IMetadata } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type { TabsIngredientInfoProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { BrandsService } from '@services/social/brands.service';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import {
  isAvatarSourceImageIngredient,
  isImageIngredient,
} from '@utils/media/ingredient-type.util';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface MetadataFieldValues {
  description: string;
  label: string;
}

export default function IngredientTabsInfo({
  ingredient,
  onUpdate,
  isUpdating = false,
  onUpdateMetadata,
}: TabsIngredientInfoProps) {
  const notifications = NotificationsService.getInstance();
  const { organizationId, refreshBrands, selectedBrand } = useBrand();
  const { refresh: refreshSettings } = useOrganization();
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(ingredient.category, token),
  );
  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );
  const metadata = ingredient.metadata as IMetadata;
  const metadataLabel = metadata?.label ?? '';
  const metadataDescription = metadata?.description ?? '';

  const [labelValue, setLabelValue] = useState(metadataLabel);
  const [descriptionValue, setDescriptionValue] = useState(metadataDescription);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  useEffect(() => {
    setLabelValue(metadataLabel);
    setDescriptionValue(metadataDescription);
  }, [metadataDescription, metadataLabel]);

  const commitField = async (
    field: 'description' | 'label',
    nextValue: string,
  ) => {
    const normalizedValue = nextValue.trim();
    const originalValue =
      field === 'label' ? metadataLabel.trim() : metadataDescription.trim();

    if (field === 'label' && normalizedValue !== nextValue) {
      setLabelValue(normalizedValue);
    }

    if (field === 'description' && normalizedValue !== nextValue) {
      setDescriptionValue(normalizedValue);
    }

    if (!onUpdateMetadata || normalizedValue === originalValue) {
      return;
    }

    await onUpdateMetadata(field, normalizedValue);
  };

  const handleLabelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    void commitField('label', labelValue);
  };

  const isAvatarImage = isAvatarSourceImageIngredient(ingredient);
  const isPlainImage =
    isImageIngredient(ingredient) &&
    ingredient.category === IngredientCategory.IMAGE;
  const isImageLike = isPlainImage || isAvatarImage;

  const runAction = useCallback(
    async (actionKey: string, action: () => Promise<void>) => {
      if (isUpdating || activeAction) {
        return;
      }

      setActiveAction(actionKey);

      try {
        await action();
      } catch (error) {
        logger.error(`Ingredient info action failed: ${actionKey}`, error);
      } finally {
        setActiveAction(null);
      }
    },
    [activeAction, isUpdating],
  );

  const handleToggleAvatar = useCallback(async () => {
    const service = await getIngredientsService();
    const nextCategory = isAvatarImage
      ? IngredientCategory.IMAGE
      : IngredientCategory.AVATAR;
    const updatedIngredient = await service.patch(ingredient.id, {
      category: nextCategory,
    });

    onUpdate?.(updatedIngredient);
    notifications.success(
      isAvatarImage ? 'Avatar type removed' : 'Image marked as avatar',
    );
  }, [
    getIngredientsService,
    ingredient.id,
    isAvatarImage,
    notifications,
    onUpdate,
  ]);

  const handleSetOrganizationDefaultAvatar = useCallback(async () => {
    if (!organizationId) {
      notifications.error('Organization context is unavailable');
      return;
    }

    const service = await getOrganizationsService();
    await service.patchSettings(organizationId, {
      defaultAvatarIngredientId: ingredient.id,
    });
    await refreshSettings();
    notifications.success('Organization default avatar updated');
  }, [
    getOrganizationsService,
    ingredient.id,
    notifications,
    organizationId,
    refreshSettings,
  ]);

  const handleSetBrandDefaultAvatar = useCallback(async () => {
    if (!selectedBrand?.id) {
      notifications.error('Brand context is unavailable');
      return;
    }

    const service = await getBrandsService();
    await service.updateAgentConfig(selectedBrand.id, {
      defaultAvatarIngredientId: ingredient.id,
    });
    await refreshBrands();
    notifications.success('Brand default avatar updated');
  }, [
    getBrandsService,
    ingredient.id,
    notifications,
    refreshBrands,
    selectedBrand?.id,
  ]);

  const actionDescription = useMemo(() => {
    if (isAvatarImage) {
      return 'This image is available for avatar defaults in organization and brand settings.';
    }

    if (isPlainImage) {
      return 'Mark this image as an avatar before using it as an organization or brand default.';
    }

    return null;
  }, [isAvatarImage, isPlainImage]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Core Metadata
        </p>
        <p className="mt-1 text-sm text-white/65">
          Update the label and description shown across your workspace.
        </p>
      </div>

      <div className="space-y-4">
        <FormControl label="Label">
          <Input<MetadataFieldValues>
            name="label"
            value={labelValue}
            placeholder="Enter a label"
            className="w-full"
            isDisabled={isUpdating}
            onChange={(event) => setLabelValue(event.target.value)}
            onBlur={() => void commitField('label', labelValue)}
            onKeyDown={handleLabelKeyDown}
          />
        </FormControl>

        <FormControl label="Description">
          <Textarea<MetadataFieldValues>
            name="description"
            value={descriptionValue}
            placeholder="Enter a description"
            className="w-full"
            isDisabled={isUpdating}
            onChange={(event) => setDescriptionValue(event.target.value)}
            onBlur={() => void commitField('description', descriptionValue)}
          />
        </FormControl>
      </div>

      {isImageLike && onUpdate ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
            Avatar Actions
          </p>
          {actionDescription ? (
            <p className="mt-1 text-sm text-white/65">{actionDescription}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="ingredient-avatar-toggle"
              onClick={() =>
                void runAction('toggle-avatar', handleToggleAvatar)
              }
              isDisabled={Boolean(activeAction) || isUpdating}
              withWrapper={false}
            >
              {activeAction === 'toggle-avatar'
                ? 'Saving...'
                : isAvatarImage
                  ? 'Remove Avatar Type'
                  : 'Mark as Avatar'}
            </Button>

            {isAvatarImage ? (
              <>
                <Button
                  type="button"
                  data-testid="ingredient-set-org-avatar"
                  onClick={() =>
                    void runAction(
                      'set-org-avatar',
                      handleSetOrganizationDefaultAvatar,
                    )
                  }
                  isDisabled={Boolean(activeAction) || isUpdating}
                  withWrapper={false}
                >
                  {activeAction === 'set-org-avatar'
                    ? 'Saving...'
                    : 'Set as Organization Default Avatar'}
                </Button>

                <Button
                  type="button"
                  data-testid="ingredient-set-brand-avatar"
                  onClick={() =>
                    void runAction(
                      'set-brand-avatar',
                      handleSetBrandDefaultAvatar,
                    )
                  }
                  isDisabled={Boolean(activeAction) || isUpdating}
                  withWrapper={false}
                >
                  {activeAction === 'set-brand-avatar'
                    ? 'Saving...'
                    : 'Set as Brand Default Avatar'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
