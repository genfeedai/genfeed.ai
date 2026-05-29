'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IngredientDetailProps } from '@props/content/ingredient.props';
import {
  useIngredientOverlay,
  usePostModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import Breadcrumb from '@ui/navigation/breadcrumb/Breadcrumb';
import { format } from 'date-fns';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import IngredientDetailBody from './ingredient-detail-body';
import IngredientDetailCacheAlert from './ingredient-detail-cache-alert';
import IngredientDetailNotFound from './ingredient-detail-not-found';

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
    return <IngredientDetailNotFound type={type} />;
  }

  return (
    <Container>
      {isUsingCache && (
        <IngredientDetailCacheAlert
          cachedLabel={cachedLabel}
          onRetry={findIngredient}
        />
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

      <IngredientDetailBody
        ingredient={ingredient}
        childIngredients={childIngredients}
        credentials={credentials}
        isTrimModalOpen={isTrimModalOpen}
        isUpdating={isUpdating}
        handlers={handlers}
        loadingStates={loadingStates}
        onShareVideo={handleShareVideo}
        onTrimVideo={handleTrimVideo}
        onUpdateSharing={handleUpdateSharing}
        onUpdateMetadata={handleUpdateMetadata}
        onTrimConfirm={handleTrimConfirm}
        onTrimClose={handleTrimClose}
      />
    </Container>
  );
}
