import { useBrand } from '@contexts/user/brand-context/brand-context';
import { usePostModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { IngredientCategory } from '@genfeedai/contracts';
import { createAdminIngredientRoute } from '@genfeedai/contracts/constants';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import {
  createCacheKey,
  createLocalStorageCache,
} from '@helpers/data/cache/cache.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useIngredientServices } from '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services';
import useIngredientActions from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import { IngredientsService } from '@services/content/ingredients.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { buildAgentPromptHref } from '@utils/url/desktop-loop-url.util';
import { format } from 'date-fns';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIngredientSidebar } from '@/hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar';
import type { IngredientDetailProps } from '@/props/content/ingredient.props';

const INGREDIENT_CACHE_TTL_MS = 15 * 60 * 1000;
const NO_CHILDREN: IIngredient[] = [];

/**
 * The ingredient as the detail page shows it. `isFromDeviceCache` is set when
 * the API could not be reached and the copy saved on this device (saved at
 * `cachedAt`) was used instead.
 */
interface IngredientDetailData {
  cachedAt: string | null;
  ingredient: IIngredient;
  isFromDeviceCache: boolean;
}

function ingredientDetailQueryKey(type: string, id: string) {
  return ['ingredient-detail', type, id] as const;
}

export function useIngredientDetail({ type, id }: IngredientDetailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { brandId, credentials } = useBrand();

  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { openPostBatchModal } = usePostModal();
  const { openIngredientSidebar } = useIngredientSidebar();

  const getIngredientsService = useAuthedService((token) =>
    IngredientsService.getInstance(type, token),
  );

  const { getVideosService, getIngredientsService: getMetadataService } =
    useIngredientServices();

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

  // The ingredient and its children read through React Query, so reopening
  // an asset paints the cached copy at once and refreshes it quietly. A read
  // the API cannot answer falls back to the copy saved on this device.
  const queryClient = useQueryClient();
  const hasScope = Boolean(brandId && id);
  const ingredientQuery = useAuthedQuery<
    IngredientsService,
    IngredientDetailData
  >({
    enabled: hasScope,
    queryFn: async (service, signal) => {
      const url = `GET /ingredients/${id}`;
      try {
        const data = await service.findOne(id, {}, signal);
        logger.info(`${url} success`, data);
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
        return { cachedAt: null, ingredient: data, isFromDeviceCache: false };
      } catch (error) {
        const cached = signal.aborted
          ? null
          : (ingredientCache?.get(ingredientCacheKey) ?? null);
        if (cached) {
          return {
            cachedAt: ingredientCacheMeta?.get(ingredientCacheKey) ?? null,
            ingredient: cached,
            isFromDeviceCache: true,
          };
        }
        throw error;
      }
    },
    queryKey: ingredientDetailQueryKey(type, id),
    service: (token: string) => IngredientsService.getInstance(type, token),
  });
  const ingredientData = ingredientQuery.data;
  const ingredient = ingredientData?.ingredient ?? null;
  const cachedAt = ingredientData?.cachedAt ?? null;
  const isUsingCache = ingredientData?.isFromDeviceCache ?? false;
  const isLoading = ingredientQuery.isPending;

  // Child ingredients are optional: a failed read is logged, never shown.
  const childrenQuery = useAuthedQuery<IngredientsService, IIngredient[]>({
    enabled: hasScope && ingredientData !== undefined && !isUsingCache,
    queryFn: async (service, signal) => {
      try {
        return await service.findAll({ parent: id }, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load child ingredients', error);
        }
        throw error;
      }
    },
    queryKey: ['ingredient-detail-children', type, id],
    service: (token: string) => IngredientsService.getInstance(type, token),
  });
  const childIngredients = childrenQuery.data ?? NO_CHILDREN;

  const ingredientError = ingredientQuery.error;
  const hasIngredient = ingredientData !== undefined;
  useEffect(() => {
    if (!ingredientError || hasIngredient) {
      return;
    }
    logger.error(`GET /ingredients/${id} failed`, ingredientError);
    notificationsService.error('Failed to load ingredient');
    router.push(`/ingredients/${type}`);
  }, [hasIngredient, id, ingredientError, notificationsService, router, type]);

  const { refetch: refetchIngredient } = ingredientQuery;
  const { refetch: refetchChildren } = childrenQuery;
  const findIngredient = useCallback(async () => {
    const { data } = await refetchIngredient();
    if (data && !data.isFromDeviceCache) {
      await refetchChildren();
    }
  }, [refetchChildren, refetchIngredient]);

  const setIngredient = useCallback(
    (next: IIngredient) => {
      queryClient.setQueriesData<IngredientDetailData>(
        { queryKey: ingredientDetailQueryKey(type, id) },
        (current) => (current ? { ...current, ingredient: next } : current),
      );
    },
    [id, queryClient, type],
  );

  const [isTrimModalOpen, setIsTrimModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const cachedLabel = useMemo(() => {
    if (!cachedAt) {
      return '';
    }
    return format(new Date(cachedAt), 'PPpp');
  }, [cachedAt]);

  const { handlers, loadingStates } = useIngredientActions({
    onPublishIngredient: (publishIngredient) => {
      if (publishIngredient) {
        openPostBatchModal(publishIngredient);
      }
    },
    onRefresh: async () => {
      if (id) {
        await findIngredient();
      }
    },
    // A child with its own admin page opens it; any other category is
    // inspected in the context sidebar.
    onSeeDetails: (detailIngredient: IIngredient) => {
      const detailHref = createAdminIngredientRoute(
        detailIngredient.category,
        detailIngredient.id,
      );

      if (detailHref) {
        router.push(detailHref);
        return;
      }

      openIngredientSidebar(detailIngredient);
    },
    // One-off generation is Agent-first — the standalone Studio video prompt
    // bar is retired, so the reference is handed to a new Agent thread.
    onUseAsVideoReference: (refIngredient: IIngredient) => {
      router.push(
        buildAgentPromptHref(
          `Generate a video that uses library image ${refIngredient.id} as the reference frame, in ${refIngredient.ingredientFormat} format.`,
        ),
      );
    },
  });

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
    [
      ingredient,
      isUpdating,
      getIngredientsService,
      notificationsService,
      setIngredient,
    ],
  );

  const handleUpdateMetadata = useCallback(
    async (field: string, value: string) => {
      if (!ingredient || isUpdating) {
        return;
      }

      const url = `PATCH /ingredients/${ingredient.id}/metadata`;
      setIsUpdating(true);

      try {
        const service = await getMetadataService();
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
    [
      ingredient,
      isUpdating,
      getMetadataService,
      notificationsService,
      setIngredient,
    ],
  );

  return {
    pathname,
    credentials,
    isLoading,
    ingredient,
    childIngredients,
    cachedLabel,
    isUsingCache,
    isTrimModalOpen,
    isUpdating,
    handlers,
    loadingStates,
    findIngredient,
    handleShareVideo,
    handleTrimVideo,
    handleTrimConfirm,
    handleTrimClose,
    handleUpdateSharing,
    handleUpdateMetadata,
  };
}
