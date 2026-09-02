'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { StudioGenerateJob } from '@pages/studio/generate/types';
import { toStudioGenerateJob } from '@pages/studio/generate/utils/studio-generate-asset';
import type { StudioGenerateFilter } from '@pages/studio/generate/utils/studio-generate-gallery';
import { buildStudioGalleryQuery } from '@pages/studio/generate/utils/studio-generate-gallery';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useState } from 'react';

export interface UseStudioGenerateGalleryParams {
  brandId: string;
  filter: StudioGenerateFilter;
}

export interface UseStudioGenerateGalleryReturn {
  isLoadingGallery: boolean;
  refresh: () => void;
  storedJobs: readonly StudioGenerateJob[];
}

/**
 * Stored generation history behind the results grid. The unified ingredients
 * endpoint hydrates metadata and prompts before rows are projected onto the
 * same job shape the live socket queue produces.
 */
export function useStudioGenerateGallery({
  brandId,
  filter,
}: UseStudioGenerateGalleryParams): UseStudioGenerateGalleryReturn {
  const [storedJobs, setStoredJobs] = useState<readonly StudioGenerateJob[]>(
    [],
  );
  const [isLoadingGallery, setIsLoadingGallery] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const refresh = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is the refresh trigger — refresh() bumps it so this effect re-runs after a generation completes.
  useEffect(() => {
    if (!brandId) {
      setStoredJobs([]);
      setIsLoadingGallery(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setIsLoadingGallery(true);

    void (async () => {
      try {
        const query = buildStudioGalleryQuery(brandId, filter);
        const service = await getIngredientsService();
        const ingredients = await service.findAll(query, controller.signal);

        if (isCancelled || controller.signal.aborted) {
          return;
        }

        const jobs = ingredients
          .map((ingredient) =>
            toStudioGenerateJob(ingredient as unknown as IIngredient),
          )
          .filter((job): job is StudioGenerateJob => job !== null)
          .toSorted((left, right) => right.createdAt - left.createdAt);

        setStoredJobs(jobs);
      } catch (error) {
        if (!isCancelled) {
          logger.error('Failed to load Studio generation history', error);
          setStoredJobs([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingGallery(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [brandId, filter, getIngredientsService, reloadToken]);

  return { isLoadingGallery, refresh, storedJobs };
}
