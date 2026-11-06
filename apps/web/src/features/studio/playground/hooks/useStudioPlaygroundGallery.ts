'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { useCallback, useRef, useState } from 'react';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { toStudioPlaygroundJob } from '@/features/studio/playground/utils/studio-playground-asset';
import type { StudioPlaygroundFilter } from '@/features/studio/playground/utils/studio-playground-gallery';
import { loadStudioGalleryIngredients } from '@/features/studio/playground/utils/studio-playground-gallery';

const EMPTY_JOBS: readonly StudioPlaygroundJob[] = [];

export interface UseStudioPlaygroundGalleryParams {
  brandId: string;
  filter: StudioPlaygroundFilter;
}

export interface UseStudioPlaygroundGalleryReturn {
  galleryError: 'load' | 'refresh' | null;
  isLoadingGallery: boolean;
  refresh: () => Promise<void>;
  storedJobs: readonly StudioPlaygroundJob[];
}

/**
 * The Studio generation history for one brand and filter. It is cached per
 * organization, brand, filter, session and API, so reopening Studio paints the
 * last history at once and refreshes it in the background; another scope
 * never sees it, and a superseded read is cancelled. `isLoadingGallery` is
 * true for the first read and for an asked-for refresh, never for the quiet
 * background one.
 */
export function useStudioPlaygroundGallery({
  brandId,
  filter,
}: UseStudioPlaygroundGalleryParams): UseStudioPlaygroundGalleryReturn {
  const { organizationId } = useBrand();
  const { sessionId } = useAuthIdentity();
  const apiEndpoint = EnvironmentService.apiEndpoint;
  const scopeKey = JSON.stringify([
    organizationId ?? null,
    brandId,
    filter,
    sessionId ?? null,
    apiEndpoint,
  ]);

  const galleryQuery = useAuthedQuery<
    IngredientsService,
    StudioPlaygroundJob[]
  >({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) => {
      // A read superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      try {
        const ingredients = await loadStudioGalleryIngredients(
          service,
          brandId,
          filter,
          signal,
        );
        return ingredients
          .map(toStudioPlaygroundJob)
          .filter((job): job is StudioPlaygroundJob => job !== null)
          .toSorted((left, right) => right.createdAt - left.createdAt);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load Studio generation history', error);
        }
        throw error;
      }
    },
    queryKey: [
      'studio-playground-gallery',
      organizationId ?? null,
      brandId,
      filter,
      sessionId ?? null,
      apiEndpoint,
    ],
    service: (token: string) => IngredientsService.getInstance(token),
  });

  // An asked-for refresh shows its progress; it belongs to the scope it was
  // asked in, so a later scope never inherits it.
  const [refreshingScope, setRefreshingScope] = useState<string | null>(null);
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;
  const { refetch } = galleryQuery;
  const refresh = useCallback(async () => {
    // A refresh captured under an earlier scope never restarts the current read.
    if (!brandId || currentScopeRef.current !== scopeKey) return;
    setRefreshingScope(scopeKey);
    try {
      await refetch();
    } finally {
      setRefreshingScope((current) => (current === scopeKey ? null : current));
    }
  }, [brandId, refetch, scopeKey]);

  if (!brandId) {
    return {
      galleryError: null,
      isLoadingGallery: false,
      refresh,
      storedJobs: EMPTY_JOBS,
    };
  }

  const jobs = galleryQuery.data;
  const isRefreshing = refreshingScope === scopeKey;
  // A retry after a failed first read starts without an error; the failure
  // stays on screen until a read succeeds.
  const hasFailed =
    galleryQuery.error !== null ||
    (galleryQuery.isFetching &&
      galleryQuery.errorUpdatedAt > galleryQuery.dataUpdatedAt);
  return {
    galleryError: hasFailed ? (jobs ? 'refresh' : 'load') : null,
    isLoadingGallery:
      jobs === undefined
        ? galleryQuery.isPending || galleryQuery.isFetching
        : galleryQuery.isFetching && isRefreshing,
    refresh,
    storedJobs: jobs ?? EMPTY_JOBS,
  };
}
