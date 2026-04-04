import type { IQueryParams } from '@genfeedai/interfaces';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  GALLERY_DEFAULT_SORT,
  GALLERY_DEFAULT_STATUSES,
} from '@genfeedai/constants/gallery.constant';
import { useAbortEffect } from '@hooks/utils/use-abort-effect/use-abort-effect';
import { logger } from '@services/core/logger.service';
import { PublicService } from '@services/external/public.service';
import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

export type GalleryItemType =
  | 'images'
  | 'videos'
  | 'musics'
  | 'posts'
  | 'articles';

export interface UseGalleryListOptions {
  /** Type of items to fetch */
  type: GalleryItemType;
  /** Additional query params to merge */
  queryParams?: Partial<IQueryParams>;
  /** Whether to include default status filter (default: true for images/videos) */
  includeStatusFilter?: boolean;
}

export interface UseGalleryListReturn<T> {
  /** Fetched items */
  items: T[];
  /** Loading state */
  isLoading: boolean;
  /** Current page number */
  page: number;
  /** Refetch function */
  refetch: () => void;
}

const SERVICE_METHOD_MAP: Record<
  GalleryItemType,
  keyof Pick<
    PublicService,
    | 'findPublicImages'
    | 'findPublicVideos'
    | 'findPublicMusics'
    | 'findPublicPosts'
    | 'findPublicArticles'
  >
> = {
  articles: 'findPublicArticles',
  images: 'findPublicImages',
  musics: 'findPublicMusics',
  posts: 'findPublicPosts',
  videos: 'findPublicVideos',
};

/**
 * Generic hook for fetching gallery list items.
 * Eliminates duplicate fetch/loading/pagination logic across gallery components.
 *
 * @example
 * // Before (repeated in 5+ components)
 * const [items, setItems] = useState([]);
 * const [isLoading, setIsLoading] = useState(true);
 * const findAll = useCallback(async (signal) => {
 *   setIsLoading(true);
 *   const service = PublicService.getInstance();
 *   const data = await service.findPublicImages({...});
 *   if (signal?.aborted) return;
 *   setItems(data);
 *   setIsLoading(false);
 * }, [page]);
 * useEffect(() => {
 *   const controller = new AbortController();
 *   findAll(controller.signal);
 *   return () => controller.abort();
 * }, [findAll]);
 *
 * // After
 * const { items, isLoading, page } = useGalleryList({ type: 'images' });
 */
export function useGalleryList<T>({
  type,
  queryParams = {},
  includeStatusFilter = true,
}: UseGalleryListOptions): UseGalleryListReturn<T> {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams?.get('page') || '1', 10);

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const publicService = useMemo(() => PublicService.getInstance(), []);

  const fetchItems = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setIsLoading(true);

        const baseParams: IQueryParams = {
          limit: ITEMS_PER_PAGE,
          page,
          sort: GALLERY_DEFAULT_SORT,
          ...(includeStatusFilter && { status: GALLERY_DEFAULT_STATUSES }),
          ...queryParams,
        };

        const methodName = SERVICE_METHOD_MAP[type];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await (
          publicService[methodName] as (params: IQueryParams) => Promise<any[]>
        )(baseParams);

        if (signal?.aborted) {
          return;
        }

        logger.info(`Fetched public ${type}:`, data.length);
        setItems(data as T[]);
        setIsLoading(false);
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error(`Failed to fetch ${type}:`, error);
        setIsLoading(false);
      }
    },
    [page, type, queryParams, includeStatusFilter, publicService],
  );

  useAbortEffect(fetchItems, [fetchItems, refetchTrigger]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return {
    isLoading,
    items,
    page,
    refetch,
  };
}
