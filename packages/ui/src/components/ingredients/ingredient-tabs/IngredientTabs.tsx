'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientFormat,
} from '@genfeedai/contracts';
import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { IngredientTabsProps } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import {
  isImageIngredient,
  isVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { IngredientEndpoints } from '@genfeedai/utils/media/ingredients.util';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import IngredientTabsInfo from '@ui/ingredients/tabs/info/IngredientTabsInfo';
import IngredientTabsMetadata from '@ui/ingredients/tabs/metadata/IngredientTabsMetadata';
import IngredientTabsPosts from '@ui/ingredients/tabs/posts/IngredientTabsPosts';
import IngredientTabsPrompts from '@ui/ingredients/tabs/prompts/IngredientTabsPrompts';
import IngredientTabsSharing from '@ui/ingredients/tabs/sharing/IngredientTabsSharing';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import { Maximize2, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

export default function IngredientTabs({
  ingredient,
  onClose,
  onUpdate,
}: IngredientTabsProps) {
  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(
      IngredientEndpoints.getEndpointFromTypeOrPath(ingredient?.category ?? ''),
      token,
    ),
  );
  const { href } = useOrgUrl();

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
        className={
          'fixed inset-0 z-40 bg-black/50' /* design-system-allow-content-color -- drawer scrim */
        }
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        data-testid="ingredient-drawer"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-2xl bg-card shadow-ambient-lg border-l border-primary/10 overflow-y-auto p-4"
      >
        <div className="flex justify-between items-center gap-2">
          <Button
            label={<X className="text-2xl" />}
            variant={ButtonVariant.LINK}
            size={ButtonSize.SM}
            onClick={onClose}
          />

          <Link
            href={href(
              createLibraryAssetRoute(ingredient.category, ingredient.id),
            )}
            className="text-primary underline-offset-4 hover:underline"
          >
            <Maximize2 className="text-2xl" />
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
              className="max-w-75 h-auto outline-media"
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
