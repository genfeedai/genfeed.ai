'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import { toStudioPlaygroundJob } from '@pages/studio/playground/utils/studio-playground-asset';
import type { StudioPlaygroundFilter } from '@pages/studio/playground/utils/studio-playground-gallery';
import { loadStudioGalleryIngredients } from '@pages/studio/playground/utils/studio-playground-gallery';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
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
  const { organizationId } = useBrand();
  const { orgId, userId, sessionId } = useAuthIdentity();
  const ownerKey = JSON.stringify([
    brandId,
    filter,
    organizationId,
    orgId,
    userId,
    sessionId,
    EnvironmentService.apiEndpoint,
  ]);
  const ownerRef = useRef({ key: ownerKey, epoch: 0 });
  if (ownerRef.current.key !== ownerKey)
    ownerRef.current = { key: ownerKey, epoch: ownerRef.current.epoch + 1 };
  const owner = ownerRef.current;
  const isMounted = useRef(true);
  const isCurrentOwner = useCallback(
    () => isMounted.current && ownerRef.current === owner,
    [owner],
  );
  const [snapshot, setSnapshot] = useState({
    owner,
    jobs: [] as readonly StudioPlaygroundJob[],
    hasLoaded: false,
    error: null as UseStudioPlaygroundGalleryReturn['galleryError'],
    loading: Boolean(brandId),
  });
  // Discard scope state during render, before children can observe old rows.
  // Epoch ownership prevents A -> B -> A resurrecting discarded A.
  const isCurrentScope = snapshot.owner === owner;
  if (!isCurrentScope) {
    setSnapshot({
      owner,
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
    if (!isCurrentOwner()) return;
    controllerRef.current?.abort();
    setReloadToken((previous) => previous + 1);
  }, [isCurrentOwner]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is the explicit refresh trigger.
  useEffect(() => {
    if (!brandId || !isCurrentOwner()) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const canApply = () =>
      isCurrentOwner() &&
      !controller.signal.aborted &&
      controllerRef.current === controller;
    setSnapshot((current) =>
      canApply() && current.owner === owner
        ? { ...current, loading: true }
        : current,
    );
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
          owner,
          jobs,
          hasLoaded: true,
          error: null,
          loading: false,
        });
      } catch (error) {
        if (!canApply()) return;
        logger.error('Failed to load Studio generation history', error);
        setSnapshot((current) =>
          canApply() && current.owner === owner
            ? {
                ...current,
                error: current.hasLoaded ? 'refresh' : 'load',
              }
            : current,
        );
      } finally {
        if (canApply())
          setSnapshot((current) =>
            canApply() && current.owner === owner
              ? { ...current, loading: false }
              : current,
          );
      }
    })();
    return () => {
      controller.abort();
    };
  }, [
    brandId,
    filter,
    getIngredientsService,
    isCurrentOwner,
    owner,
    reloadToken,
  ]);

  return {
    galleryError: isCurrentScope && brandId ? snapshot.error : null,
    isLoadingGallery: Boolean(brandId) && (!isCurrentScope || snapshot.loading),
    refresh,
    storedJobs: isCurrentScope && brandId ? snapshot.jobs : [],
  };
}
