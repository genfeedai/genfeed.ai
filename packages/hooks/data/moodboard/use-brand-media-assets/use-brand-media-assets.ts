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

interface StreamPagesOptions {
  brandId: string;
  /** False once the shared asset budget is spent, which stops further paging. */
  hasBudget: () => boolean;
  onCapped: () => void;
  onPage: (batch: IIngredient[]) => void;
  service: PageableService;
  signal: AbortSignal;
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

/**
 * Walks one ingredient service page by page, handing each page to the caller as
 * it lands instead of accumulating a full result. Paging is sequential because
 * the API reports no total, so the last page is only known once it comes up
 * short.
 */
async function streamPages({
  brandId,
  hasBudget,
  onCapped,
  onPage,
  service,
  signal,
}: StreamPagesOptions): Promise<void> {
  for (let page = 1; ; page += 1) {
    if (signal.aborted) {
      return;
    }

    if (!hasBudget()) {
      onCapped();
      return;
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

    if (signal.aborted) {
      return;
    }

    onPage(batch);

    if (batch.length < PAGE_SIZE) {
      return;
    }
  }
}

/**
 * Loads every displayable visual asset (images, videos, gifs, avatars) for the
 * active brand by fanning out parallel per-type fetches. There is no
 * combined-all endpoint, so this mirrors how the library landing preview
 * aggregates the per-type ingredient services.
 *
 * Assets are published page by page rather than after the last request
 * resolves: a brand at the cap otherwise waits on up to forty sequential
 * requests before a single tile paints. The four services share one asset
 * budget, so a large image library no longer causes four independent caps'
 * worth of rows to be fetched for a canvas that can only show one.
 */
export function useBrandMediaAssets(): UseBrandMediaAssetsResult {
  const { brandId } = useBrand();
  const [assets, setAssets] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
      setIsLoadingMore(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setIsLoadingMore(true);
    setIsTruncated(false);
    setError(null);

    async function load() {
      // One bucket per service in a fixed order, so a page arriving late never
      // reshuffles the tiles already on the canvas.
      const buckets: IIngredient[][] = [[], [], [], []];
      let accepted = 0;
      let hasPainted = false;

      function publish() {
        const merged = buckets.flat();
        setAssets(merged);

        // The canvas shows an empty state at zero assets, so the first paint
        // waits for something to actually show rather than for the first page.
        if (!hasPainted && merged.length > 0) {
          hasPainted = true;
          setIsLoading(false);
        }
      }

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

        if (controller.signal.aborted) {
          return;
        }

        // `allSettled`, not `all`: a rejected stream would resolve the await
        // immediately while its siblings were still paging, so the `finally`
        // below cleared the loading flags and the canvas painted its empty
        // state under assets that had not arrived yet.
        const outcomes = await Promise.allSettled(
          services.map((service, index) =>
            streamPages({
              brandId,
              hasBudget: () => accepted < MAX_ASSETS,
              onCapped: () => setIsTruncated(true),
              onPage: (batch) => {
                const displayable = batch.filter(isVisualMediaIngredient);
                const room = MAX_ASSETS - accepted;
                const kept = displayable.slice(0, room);

                if (kept.length < displayable.length) {
                  setIsTruncated(true);
                }

                accepted += kept.length;
                buckets[index].push(...kept);
                publish();
              },
              service: service as PageableService,
              signal: controller.signal,
            }),
          ),
        );

        const failure = outcomes.find(
          (outcome): outcome is PromiseRejectedResult =>
            outcome.status === 'rejected',
        );

        // A partial load still shows what did arrive; the error only surfaces
        // when nothing did.
        if (failure && accepted === 0) {
          throw failure.reason;
        }
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
          setIsLoadingMore(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [brandId, reloadToken]);

  return { assets, error, isLoading, isLoadingMore, isTruncated, refresh };
}
