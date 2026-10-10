'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import { toStudioPlaygroundJob } from '@pages/studio/playground/utils/studio-playground-asset';
import type { StudioPlaygroundFilter } from '@pages/studio/playground/utils/studio-playground-gallery';
import { loadStudioGalleryIngredients } from '@pages/studio/playground/utils/studio-playground-gallery';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseStudioPlaygroundGalleryParams {
  brandId: string;
  filter: StudioPlaygroundFilter;
}

export interface UseStudioPlaygroundGalleryReturn {
  galleryError: 'load' | 'refresh' | null;
  isLoadingGallery: boolean;
  refresh: () => void;
  storedJobs: readonly StudioPlaygroundJob[];
}

export function useStudioPlaygroundGallery({
  brandId,
  filter,
}: UseStudioPlaygroundGalleryParams): UseStudioPlaygroundGalleryReturn {
  const [snapshot, setSnapshot] = useState({
    brandId,
    filter,
    jobs: [] as readonly StudioPlaygroundJob[],
    hasLoaded: false,
    error: null as UseStudioPlaygroundGalleryReturn['galleryError'],
    loading: Boolean(brandId),
  });
  // Discard scope state during render, before children can observe old rows.
  // Keeping only one scope also prevents A -> B -> A resurrecting discarded A.
  const isCurrentScope =
    snapshot.brandId === brandId && snapshot.filter === filter;
  if (!isCurrentScope) {
    setSnapshot({
      brandId,
      filter,
      jobs: [],
      hasLoaded: false,
      error: null,
      loading: Boolean(brandId),
    });
  }
  const [reloadToken, setReloadToken] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const refresh = useCallback(() => {
    controllerRef.current?.abort();
    setReloadToken((previous) => previous + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is the explicit refresh trigger.
  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const canApply = () =>
      !controller.signal.aborted && controllerRef.current === controller;
    setSnapshot((current) => ({ ...current, loading: true }));
    void (async () => {
      try {
        const service = await getIngredientsService();
        if (!canApply()) return;
        const ingredients = await loadStudioGalleryIngredients(
          service,
          brandId,
          filter,
          controller.signal,
        );
        if (!canApply()) return;
        const jobs = ingredients
          .map(toStudioPlaygroundJob)
          .filter((job): job is StudioPlaygroundJob => job !== null)
          .toSorted((left, right) => right.createdAt - left.createdAt);
        setSnapshot({
          brandId,
          filter,
          jobs,
          hasLoaded: true,
          error: null,
          loading: false,
        });
      } catch (error) {
        if (!canApply()) return;
        logger.error('Failed to load Studio generation history', error);
        setSnapshot((current) => ({
          ...current,
          error: current.hasLoaded ? 'refresh' : 'load',
        }));
      } finally {
        if (canApply())
          setSnapshot((current) => ({ ...current, loading: false }));
      }
    })();
    return () => {
      controller.abort();
    };
  }, [brandId, filter, getIngredientsService, reloadToken]);

  return {
    galleryError: isCurrentScope && brandId ? snapshot.error : null,
    isLoadingGallery: Boolean(brandId) && (!isCurrentScope || snapshot.loading),
    refresh,
    storedJobs: isCurrentScope && brandId ? snapshot.jobs : [],
  };
}
