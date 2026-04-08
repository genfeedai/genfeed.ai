'use client';

import { ButtonSize, ButtonVariant, IngredientFormat } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { IngredientTabsProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@utils/media/ingredient-type.util';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineArrowsPointingOut, HiXMark } from 'react-icons/hi2';

export default function IngredientTabs({
  ingredient,
  onClose,
  onUpdate,
}: IngredientTabsProps) {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(ingredient?.category ?? '', token),
  );

  const [tab, setTab] = useState<
    'info' | 'posts' | 'metadata' | 'prompts' | 'sharing'
  >('info');
  const [isUpdating, setIsUpdating] = useState(false);
  const [hasMounted] = useState(() => typeof window !== 'undefined');

  const handleUpdateMetadata = useCallback(
    async (field: string, value: string) => {
      if (isUpdating || !ingredient) {
        return;
      }

      const url = `PATCH /ingredients/${ingredient.id}/metadata`;
      setIsUpdating(true);

      const notification = NotificationsService.getInstance();

      try {
        const service = await getIngredientsService();
        const data = await service.patchMetadata(ingredient.id, {
          [field]: value,
        });

        logger.info(`${url} success`, data);
        notification.success(`${field} updated`);

        if (onUpdate) {
          onUpdate(data);
        }
        setIsUpdating(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notification.error(`Failed to update ${field}`);
        setIsUpdating(false);

        throw error;
      }
    },
    [ingredient, isUpdating, onUpdate, getIngredientsService],
  );

  const handleUpdateSharing = useCallback(
    async (field: string, value: boolean | string) => {
      if (isUpdating || !ingredient) {
        return;
      }

      const url = `PATCH /ingredients/${ingredient.id}`;
      setIsUpdating(true);

      const notification = NotificationsService.getInstance();

      try {
        const service = await getIngredientsService();
        const data = await service.patch(ingredient.id, {
          [field]: value,
        });

        logger.info(`${url} success`, data);
        notification.success(`${field} updated`);

        if (onUpdate) {
          onUpdate(data);
        }
        setIsUpdating(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notification.error(`Failed to update ${field}`);
        setIsUpdating(false);

        throw error;
      }
    },
    [ingredient, isUpdating, onUpdate, getIngredientsService],
  );

  if (!ingredient || !hasMounted) {
    return null;
  }

  const isImage = isImageIngredient(ingredient);

  const isVideo = isVideoIngredient(ingredient);

  return createPortal(
    <>
      <div
        data-testid="ingredient-drawer-overlay"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        data-testid="ingredient-drawer"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-2xl bg-card shadow-xl border-l border-primary/10 overflow-y-auto p-4"
      >
        <div className="flex justify-between items-center gap-2">
          <Button
            label={<HiXMark className="text-2xl" />}
            variant={ButtonVariant.LINK}
            size={ButtonSize.SM}
            onClick={onClose}
          />

          <Link
            href={`/ingredients/${ingredient.category}s/${ingredient.id}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            <HiOutlineArrowsPointingOut className="text-2xl" />
          </Link>
        </div>

        <div className="p-4 space-y-4">
          {isVideo && (
            <div
              className={
                ingredient.ingredientFormat === IngredientFormat.PORTRAIT
                  ? 'max-w-56'
                  : 'w-full'
              }
            >
              <VideoPlayer
                src={ingredient.ingredientUrl as string}
                thumbnail={ingredient.thumbnailUrl as string}
              />
            </div>
          )}

          {isImage && (
            <Image
              src={
                (ingredient.ingredientUrl as string) ||
                `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
              }
              alt={ingredient.metadataLabel as string}
              width={ingredient.metadataWidth || 1080}
              height={ingredient.metadataHeight || 1920}
              className="max-w-75 h-auto"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority
            />
          )}

          <Tabs
            tabs={['info', 'posts', 'metadata', 'prompts', 'sharing']}
            activeTab={tab}
            onTabChange={(t) =>
              setTab(t as 'info' | 'posts' | 'metadata' | 'prompts' | 'sharing')
            }
          />

          <div className="mt-4">
            {tab === 'info' && (
              <IngredientTabsInfo
                ingredient={ingredient}
                onUpdateMetadata={handleUpdateMetadata}
                isUpdating={isUpdating}
              />
            )}

            {tab === 'posts' && <IngredientTabsPosts ingredient={ingredient} />}

            {tab === 'metadata' && (
              <IngredientTabsMetadata ingredient={ingredient} />
            )}

            {tab === 'prompts' && (
              <IngredientTabsPrompts ingredient={ingredient} />
            )}

            {tab === 'sharing' && (
              <IngredientTabsSharing
                ingredient={ingredient}
                isUpdating={isUpdating}
                onUpdateSharing={handleUpdateSharing}
              />
            )}
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}
