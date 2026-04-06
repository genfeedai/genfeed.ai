'use client';

import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient, IQueryParams } from '@genfeedai/interfaces';
import type { AssetQueryService } from '@genfeedai/interfaces/studio/studio-generate.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UseAssetLoadingParams,
  UseAssetLoadingReturn,
} from '@pages/studio/generate/types';
import {
  DEFAULT_INGREDIENT_STATUSES,
  isImageOrVideoCategory,
} from '@pages/studio/generate/utils/helpers';
import { PagesService } from '@services/content/pages.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { AvatarsService } from '@services/ingredients/avatars.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useCallback, useMemo, useRef, useState } from 'react';

const ITEMS_PER_PAGE = 24;

export function useAssetLoading({
  brandId,
  categoryType,
  isReady,
  syncPlaybackState,
  stopAllMusic,
  filtersRef,
}: UseAssetLoadingParams): UseAssetLoadingReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [allAssets, setAllAssets] = useState<IIngredient[]>([]);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const isLoadingAssetsRef = useRef(false);

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  const getAvatarsService = useAuthedService((token: string) =>
    AvatarsService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const resetPaginationState = useCallback(() => {
    setAllAssets([]);
    setCurrentPage(1);
    setLoadedPages([]);
    setHasMore(true);
    setInitialLoadComplete(false);
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);
  }, []);

  const findAllAssets = useCallback(
    async (
      page: number = 1,
      append: boolean = false,
      skipLoadingState: boolean = false,
      overrideBrandId?: string,
    ) => {
      const effectiveBrandId = overrideBrandId || brandId;

      if (!effectiveBrandId) {
        setAllAssets([]);
        if (!append) {
          setInitialLoadComplete(true);
          setIsLoading(false);
        }
        return;
      }

      if (!skipLoadingState) {
        if (!append) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }
      }

      try {
        let service: AssetQueryService;
        switch (categoryType) {
          case IngredientCategory.IMAGE:
            service = await getImagesService();
            break;
          case IngredientCategory.VIDEO:
            service = await getVideosService();
            break;
          case IngredientCategory.AVATAR:
            service = await getAvatarsService();
            break;
          case IngredientCategory.MUSIC:
            service = await getMusicsService();
            break;
          default:
            throw new Error(`Unknown category type: ${categoryType}`);
        }

        const currentFilters = filtersRef.current;
        const statusParam = Array.isArray(currentFilters.status)
          ? currentFilters.status.filter(Boolean)
          : currentFilters.status
            ? [currentFilters.status]
            : DEFAULT_INGREDIENT_STATUSES;

        const formatFilter =
          isImageOrVideoCategory(categoryType) &&
          currentFilters.format &&
          currentFilters.format !== 'all'
            ? currentFilters.format
            : undefined;

        const query: IQueryParams = {
          brand: effectiveBrandId,
          limit: ITEMS_PER_PAGE,
          page,
          sort: currentFilters.sort || 'createdAt: -1',
          ...(statusParam.length > 0 && { status: statusParam }),
          ...(currentFilters.search && { search: currentFilters.search }),
          ...(formatFilter && { format: formatFilter }),
          ...(categoryType === IngredientCategory.AVATAR && {
            category: IngredientCategory.AVATAR,
          }),
        };

        const data = await service.findAll(query);
        logger.info('GET /assets', data);

        const currentPageFromService = PagesService.getCurrentPage();
        const totalPages = PagesService.getTotalPages();
        setHasMore(currentPageFromService < totalPages);

        setLoadedPages((prev) =>
          prev.includes(page) ? prev : [...prev, page].sort((a, b) => a - b),
        );

        setAllAssets((prev: IIngredient[]) => {
          const sortByDate = (a: IIngredient, b: IIngredient) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

          if (append) {
            const existingMap = new Map(
              prev.map((asset) => [asset.id as string, asset]),
            );
            data.forEach((asset: IIngredient) => {
              if (asset.id) {
                existingMap.set(asset.id, asset);
              }
            });
            return syncPlaybackState(
              Array.from(existingMap.values()).sort(sortByDate),
            );
          }

          return syncPlaybackState([...data].sort(sortByDate));
        });

        if (!append) {
          setInitialLoadComplete(true);
        }
      } catch (error) {
        logger.error('Failed to fetch assets', error);
        notificationsService.error('Failed to load assets');
        if (!append) {
          setInitialLoadComplete(true);
        }
      } finally {
        if (!skipLoadingState) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [
      brandId,
      categoryType,
      getImagesService,
      getVideosService,
      getAvatarsService,
      getMusicsService,
      syncPlaybackState,
      notificationsService,
      filtersRef,
    ],
  );

  const handleLoadMore = useCallback(async () => {
    if (!isLoadingMore && hasMore && brandId) {
      const totalPages = PagesService.getTotalPages();
      const currentServicePage = PagesService.getCurrentPage();
      const nextPage =
        Math.max(...loadedPages, currentServicePage, currentPage) + 1;

      if (nextPage > totalPages) {
        return setHasMore(false);
      }

      setCurrentPage(nextPage);
      await findAllAssets(nextPage, true);
    }
  }, [
    loadedPages,
    currentPage,
    isLoadingMore,
    hasMore,
    brandId,
    findAllAssets,
  ]);

  const handleRefresh = useCallback(() => {
    if (isLoading || isLoadingMore) {
      return;
    }

    stopAllMusic();
    setIsRefreshing(true);
    setHasMore(true);
    setCurrentPage(1);
    setLoadedPages([]);

    isLoadingAssetsRef.current = true;
    PagesService.setCurrentPage(1);
    PagesService.setTotalPages(1);

    findAllAssets(1, false, true).finally(() => {
      isLoadingAssetsRef.current = false;
      setIsRefreshing(false);
    });
  }, [findAllAssets, isLoading, isLoadingMore, stopAllMusic]);

  return {
    allAssets,
    currentPage,
    findAllAssets,
    handleLoadMore,
    handleRefresh,
    hasMore,
    initialLoadComplete,
    isLoading,
    isLoadingMore,
    isRefreshing,
    resetPaginationState,
    setAllAssets,
  };
}
