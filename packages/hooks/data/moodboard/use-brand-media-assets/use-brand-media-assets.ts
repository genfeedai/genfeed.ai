'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { AvatarsService } from '@genfeedai/services/ingredients/avatars.service';
import { GIFsService } from '@genfeedai/services/ingredients/gifs.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import {
  isAvatarSourceImageIngredient,
  isAvatarVideoIngredient,
} from '@genfeedai/utils/media/ingredient-type.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseBrandMediaAssetsResult } from './use-brand-media-assets.types';

const PAGE_SIZE = 100;
/** Safety cap so a huge brand can never spin the canvas into thousands of nodes. */
const MAX_ASSETS = 1000;
const DISPLAYABLE_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

interface PageableService {
  findAll(
    query: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<IIngredient[]>;
}

function isVisualMediaIngredient(ingredient: IIngredient): boolean {
  const isVisualCategory =
    ingredient.category === IngredientCategory.IMAGE ||
    ingredient.category === IngredientCategory.VIDEO ||
    ingredient.category === IngredientCategory.GIF ||
    isAvatarSourceImageIngredient(ingredient) ||
    isAvatarVideoIngredient(ingredient);

  return (
    isVisualCategory &&
    Boolean(ingredient.ingredientUrl || ingredient.thumbnailUrl)
  );
}

async function fetchAllPages(
  service: PageableService,
  brandId: string,
  signal: AbortSignal,
): Promise<IIngredient[]> {
  const collected: IIngredient[] = [];

  for (let page = 1; collected.length < MAX_ASSETS; page += 1) {
    if (signal.aborted) {
      break;
    }

    const batch = await service.findAll(
      {
        brand: brandId,
        lightweight: true,
        status: DISPLAYABLE_STATUSES,
        limit: PAGE_SIZE,
        page,
      },
      // Forward the abort signal so an in-flight page request is cancelled on
      // unmount, not just checked between pages.
      signal,
    );

    collected.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return collected;
}

/**
 * Loads every displayable visual asset (images, videos, gifs, avatars) for the
 * active brand by fanning out parallel per-type fetches and merging the result.
 * There is no combined-all endpoint, so this mirrors how the library landing
 * preview aggregates the per-type ingredient services.
 */
export function useBrandMediaAssets(): UseBrandMediaAssetsResult {
  const { brandId } = useBrand();
  const [assets, setAssets] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const getGifsService = useAuthedService((token: string) =>
    GIFsService.getInstance(token),
  );
  const getAvatarsService = useAuthedService((token: string) =>
    AvatarsService.getInstance(token),
  );

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  // useRef keeps the getters stable for the effect dependency array.
  const serviceGetters = useRef({
    getAvatarsService,
    getGifsService,
    getImagesService,
    getVideosService,
  });
  serviceGetters.current = {
    getAvatarsService,
    getGifsService,
    getImagesService,
    getVideosService,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: service getters are read from a ref to keep them out of the deps; reload is driven by brandId + reloadToken.
  useEffect(() => {
    if (!brandId) {
      setAssets([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const {
          getImagesService: images,
          getVideosService: videos,
          getGifsService: gifs,
          getAvatarsService: avatars,
        } = serviceGetters.current;

        const services = await Promise.all([
          images(),
          videos(),
          gifs(),
          avatars(),
        ]);

        const batches = await Promise.all(
          services.map((service) =>
            fetchAllPages(
              service as PageableService,
              brandId,
              controller.signal,
            ),
          ),
        );

        if (controller.signal.aborted) {
          return;
        }

        const merged = batches.flat().filter(isVisualMediaIngredient);
        setIsTruncated(merged.length > MAX_ASSETS);
        setAssets(merged.slice(0, MAX_ASSETS));
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          caught instanceof Error ? caught : new Error('Failed to load assets'),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [brandId, reloadToken]);

  return { assets, error, isLoading, isTruncated, refresh };
}
