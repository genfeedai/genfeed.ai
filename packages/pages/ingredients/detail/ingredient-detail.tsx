'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type {
  IngredientDetailImageProps,
  IngredientDetailProps,
  IngredientDetailVideoProps,
} from '@props/content/ingredient.props';
import {
  useIngredientOverlay,
  usePostModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import IngredientDetailImage from '@ui/ingredients/detail-image/IngredientDetailImage';
import IngredientDetailVideo from '@ui/ingredients/detail-video/IngredientDetailVideo';
import Container from '@ui/layout/container/Container';
import { LazyModalTrim } from '@ui/lazy/modal/LazyModal';
import Loading from '@ui/loading/default/Loading';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiArrowLeft } from 'react-icons/hi2';

const INGREDIENT_CACHE_TTL_MS = 15 * 60 * 1000;

export default function IngredientDetail({ type, id }: IngredientDetailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { brandId, credentials } = useBrand();

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { openPostBatchModal } = usePostModal();
  const { openIngredientOverlay } = useIngredientOverlay();

  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(type, token),
  );

  const { getVideosService } = useIngredientServices();

  const ingredientCacheKey = useMemo(
    () => createCacheKey('ingredient', type, id),
    [type, id],
  );

  const ingredientCache = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<IIngredient>({
      prefix: 'ingredients:detail:',
    });
  }, []);

  const ingredientCacheMeta = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return createLocalStorageCache<string>({
      prefix: 'ingredients:detail:meta:',
    });
  }, []);

  const [isLoading, setIsLoading] = useState(true);
  const [ingredient, setIngredient] = useState<IIngredient | null>(null);
  const [childIngredients, setChildIngredients] = useState<IIngredient[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [isTrimModalOpen, setIsTrimModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const cachedLabel = useMemo(() => {
    if (!cachedAt) {
      return '';
    }
    return format(new Date(cachedAt), 'PPpp');
  }, [cachedAt]);

  // Use centralized ingredient actions
  const { handlers, loadingStates } = useIngredientActions({
    onPublishIngredient: (publishIngredient) => {
      if (publishIngredient) {
        openPostBatchModal(publishIngredient);
      }
    },
    onRefresh: async () => {
      if (id) {
        const service = await getIngredientsService();
        const data = await service.findOne(id);
        setIngredient(data);
        await findChildIngredients(id);
      }
    },
    onSeeDetails: (ingredient: IIngredient) => {
      openIngredientOverlay(ingredient);
    },
    onUseAsVideoReference: (ingredient: IIngredient) => {
      router.push(
        `/studio/video?referenceImageId=${ingredient.id}&format=${ingredient.ingredientFormat}`,
      );
    },
  });

  const findChildIngredients = useCallback(
    async (parentId: string) => {
      try {
        const service = await getIngredientsService();
        const data = await service.findAll({
          parent: parentId,
        });

        setChildIngredients(data);
      } catch (error) {
        logger.error('Failed to load child ingredients', error);
        // Don't show error to user as child ingredients are optional
      }
    },
    [getIngredientsService],
  );

  const findIngredient = useCallback(async () => {
    setIsLoading(true);
    const url = `GET /ingredients/${id}`;

    try {
      const service = await getIngredientsService();
      const data = await service.findOne(id);

      logger.info(`${url} success`, data);
      setIngredient(data);
      if (ingredientCache && ingredientCacheMeta) {
        ingredientCache.set(ingredientCacheKey, data, INGREDIENT_CACHE_TTL_MS);
        ingredientCacheMeta.set(
          ingredientCacheKey,
          new Date().toISOString(),
          INGREDIENT_CACHE_TTL_MS,
        );
      }
      setIsUsingCache(false);
      setCachedAt(null);

      // Fetch child ingredients
      await findChildIngredients(id);
      setIsLoading(false);
    } catch (error) {
      const cached = ingredientCache?.get(ingredientCacheKey) ?? null;
      const cachedTimestamp =
        ingredientCacheMeta?.get(ingredientCacheKey) ?? null;

      if (cached) {
        setIngredient(cached);
        setIsUsingCache(true);
        setCachedAt(cachedTimestamp);
        setIsLoading(false);
        return;
      }

      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to load ingredient');
      router.push(`/ingredients/${type}`);
      setIsLoading(false);
    }
  }, [
    id,
    type,
    router,
    notificationsService,
    ingredientCache,
    ingredientCacheKey,
    ingredientCacheMeta,
    getIngredientsService,
    findChildIngredients,
  ]);

  useEffect(() => {
    if (!brandId || !id) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      const url = `GET /ingredients/${id}`;

      try {
        const service = await getIngredientsService();
        const data = await service.findOne(id);

        if (cancelled) {
          return;
        }

        logger.info(`${url} success`, data);
        setIngredient(data);
        if (ingredientCache && ingredientCacheMeta) {
          ingredientCache.set(
            ingredientCacheKey,
            data,
            INGREDIENT_CACHE_TTL_MS,
          );
          ingredientCacheMeta.set(
            ingredientCacheKey,
            new Date().toISOString(),
            INGREDIENT_CACHE_TTL_MS,
          );
        }
        setIsUsingCache(false);
        setCachedAt(null);

        // Fetch child ingredients
        try {
          const childData = await service.findAll({ parent: id });
          if (!cancelled) {
            setChildIngredients(childData);
          }
        } catch (error) {
          logger.error('Failed to load child ingredients', error);
        }

        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const cached = ingredientCache?.get(ingredientCacheKey) ?? null;
        const cachedTimestamp =
          ingredientCacheMeta?.get(ingredientCacheKey) ?? null;

        if (cached) {
          setIngredient(cached);
          setIsUsingCache(true);
          setCachedAt(cachedTimestamp);
          setIsLoading(false);
          return;
        }

        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to load ingredient');
        router.push(`/ingredients/${type}`);
        setIsLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [
    brandId,
    id,
    type,
    router,
    ingredientCache,
    ingredientCacheKey,
    ingredientCacheMeta,
    getIngredientsService,
    notificationsService,
  ]);

  const handleShareVideo = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}${pathname}`;

    try {
      await clipboardService.copyToClipboard(url);
      notificationsService.success('Link copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy to clipboard', error);
      notificationsService.error('Failed to copy link');
    }
  };

  const handleTrimVideo = () => {
    setIsTrimModalOpen(true);
  };

  const handleTrimConfirm = async (startTime: number, endTime: number) => {
    if (!ingredient || ingredient.category !== IngredientCategory.VIDEO) {
      return notificationsService.error('Can only trim videos');
    }

    setIsTrimModalOpen(false);
    const url = `POST /videos/${ingredient.id}/trim`;

    try {
      const service = await getVideosService();
      await service.postTrim(ingredient.id, startTime, endTime);

      logger.info(`${url} success`);

      // Refresh ingredient data to show updated video
      await findIngredient();

      notificationsService.success('Video trimmed successfully');
    } catch (error) {
      logger.error(`${url} failed`, error);
      notificationsService.error('Failed to trim video');
    }
  };

  const handleTrimClose = () => {
    setIsTrimModalOpen(false);
  };

  const handleUpdateSharing = useCallback(
    async (field: string, value: boolean | string) => {
      if (!ingredient || isUpdating) {
        return;
      }

      const url = `PATCH /ingredients/${ingredient.id}`;
      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        const data = await service.patch(ingredient.id, {
          [field]: value,
        });

        logger.info(`${url} success`, data);
        notificationsService.success('Sharing settings updated');
        setIngredient(data);
        setIsUpdating(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to update sharing settings');
        setIsUpdating(false);
      }
    },
    [ingredient, isUpdating, getIngredientsService, notificationsService],
  );

  const handleUpdateMetadata = useCallback(
    async (field: string, value: string) => {
      if (!ingredient || isUpdating) {
        return;
      }

      const url = `PATCH /ingredients/${ingredient.id}/metadata`;
      setIsUpdating(true);

      try {
        const service = await getIngredientsService();
        const data = await service.patchMetadata(ingredient.id, {
          [field]: value,
        });

        logger.info(`${url} success`, data);
        notificationsService.success('Metadata updated');
        setIngredient(data);
        setIsUpdating(false);
      } catch (error) {
        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to update metadata');
        setIsUpdating(false);
      }
    },
    [ingredient, isUpdating, getIngredientsService, notificationsService],
  );

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!ingredient) {
    return (
      <Container>
        <Card className="text-center">
          <h3 className="text-lg font-bold mb-4">Ingredient Not Found</h3>
          <p className="text-foreground/70 mb-6">
            The ingredient you&apos;re looking for doesn&apos;t exist or has
            been deleted.
          </p>

          <Link
            href={`/ingredients/${type}`}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          >
            <HiArrowLeft /> Back to {type}
          </Link>
        </Card>
      </Container>
    );
  }

  return (
    <>
      <Container>
        {isUsingCache && (
          <Alert type={AlertCategory.WARNING} className="mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">
                  Live ingredient data is unavailable.
                </div>
                <div className="text-xs text-foreground/70">
                  Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}
                  .
                </div>
              </div>
              <Button
                label="Retry"
                variant={ButtonVariant.OUTLINE}
                onClick={findIngredient}
              />
            </div>
          </Alert>
        )}

        <Breadcrumb
          segments={[
            { href: `/ingredients/${type}`, label: type },
            {
              href: pathname,
              label: ingredient.metadataLabel || ingredient.id,
            },
          ]}
        />

        <div className="grid grid-cols-3 gap-6 h-full p-6">
          {ingredient.category === IngredientCategory.VIDEO ? (
            <IngredientDetailVideo
              video={ingredient}
              childIngredients={childIngredients}
              credentials={credentials}
              onShareVideo={handleShareVideo}
              onTrimVideo={handleTrimVideo}
              onPublishVideo={
                handlers.handlePublish as IngredientDetailVideoProps['onPublishVideo']
              }
              onDownloadVideo={
                handlers.handleDownload as IngredientDetailVideoProps['onDownloadVideo']
              }
              // onUpscaleVideo={handlers.handleUpscale}
              // onCloneVideo={handlers.handleClone}
              onReverseVideo={handlers.handleReverse}
              onMirrorVideo={handlers.handleMirror}
              // onPortraitVideo={handlers.handlePortrait}
              onConvertToGif={handlers.handleConvertToGif}
              onGenerateCaptions={handlers.handleGenerateCaptions}
              onAddTextOverlay={handlers.handleAddTextOverlay}
              onCopyPrompt={handlers.handleCopyPrompt}
              onReprompt={handlers.handleReprompt}
              // onSeeDetails={handlers.handleSeeDetails}
              onUpdateSharing={handleUpdateSharing}
              onUpdateMetadata={handleUpdateMetadata}
              isPublishing={loadingStates.isPublishing}
              isDownloading={loadingStates.isDownloading}
              isUpscaling={loadingStates.isUpscaling}
              isCloning={loadingStates.isCloning}
              isReversing={loadingStates.isReversing}
              isMirroring={loadingStates.isMirroring}
              isPortraiting={loadingStates.isPortraiting}
              isConverting={loadingStates.isConverting}
              isGeneratingCaptions={loadingStates.isGeneratingCaptions}
              isAddingTextOverlay={loadingStates.isAddingTextOverlay}
              isUpdating={isUpdating}
            />
          ) : (
            <IngredientDetailImage
              image={ingredient}
              childIngredients={childIngredients}
              onShareImage={handleShareVideo}
              onPublishImage={
                handlers.handlePublish as IngredientDetailImageProps['onPublishImage']
              }
              onDownloadImage={
                handlers.handleDownload as IngredientDetailImageProps['onDownloadImage']
              }
              // onUpscaleImage={handlers.handleUpscale}
              // onCloneImage={handlers.handleClone}
              onConvertToVideo={handlers.handleConvertToVideo}
              onUseAsVideoReference={handlers.handleUseAsVideoReference}
              onCopyPrompt={handlers.handleCopyPrompt}
              onReprompt={handlers.handleReprompt}
              // onSeeDetails={handlers.handleSeeDetails}
              onUpdateSharing={handleUpdateSharing}
              onUpdateMetadata={handleUpdateMetadata}
              isPublishing={loadingStates.isPublishing}
              isDownloading={loadingStates.isDownloading}
              isUpscaling={loadingStates.isUpscaling}
              isCloning={loadingStates.isCloning}
              isConvertingToVideo={loadingStates.isConvertingToVideo}
              isUpdating={isUpdating}
            />
          )}
        </div>
      </Container>

      {isTrimModalOpen && ingredient.category === IngredientCategory.VIDEO && (
        <LazyModalTrim
          videoUrl={`${EnvironmentService.ingredientsEndpoint}/ingredients/${ingredient.id}`}
          videoId={ingredient.id}
          videoDuration={
            typeof ingredient.metadata === 'object'
              ? ingredient.metadata?.duration || 10
              : 10
          }
          onConfirm={handleTrimConfirm}
          onClose={handleTrimClose}
        />
      )}
    </>
  );
}
