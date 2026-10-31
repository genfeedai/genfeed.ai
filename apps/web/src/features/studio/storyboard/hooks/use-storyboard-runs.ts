'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback, useEffect, useState } from 'react';
import type { StoryboardListRun } from '@/features/studio/props/storyboard.props';

export const STORYBOARD_RUNS_PAGE_SIZE = 50;

export interface UseStoryboardRunsResult {
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  /** Loads the next page, or retries the page that last failed. */
  readonly loadMore: () => void;
  readonly runs: StoryboardListRun[];
}

/**
 * Studio → Storyboard saved runs for the active brand, newest edit first. A
 * `search` term narrows both run sources by title on the server.
 */
export function useStoryboardRuns(search = ''): UseStoryboardRunsResult {
  const brandId = useBrandId();
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const [runs, setRuns] = useState<StoryboardListRun[]>([]);
  const [request, setRequest] = useState({ attempt: 0, page: 1 });
  const [loadedPage, setLoadedPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A brand switch or a new search starts the list over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandId and search are the reset triggers.
  useEffect(() => {
    setRuns([]);
    setLoadedPage(0);
    setRequest((current) =>
      current.page === 1 && current.attempt === 0
        ? current
        : { attempt: 0, page: 1 },
    );
  }, [brandId, search]);

  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    const { page } = request;
    const searchParam = search ? { search } : {};
    setIsLoading(true);

    const load = async () => {
      try {
        const service = await getContentRunsService();
        const results = await Promise.allSettled([
          service.listBrandRemixRuns(
            brandId,
            { limit: STORYBOARD_RUNS_PAGE_SIZE, page, ...searchParam },
            controller.signal,
          ),
          service.listStoryboardRuns(
            brandId,
            { limit: STORYBOARD_RUNS_PAGE_SIZE, page, ...searchParam },
            controller.signal,
          ),
        ]);
        if (controller.signal.aborted) return;
        const pageRuns: StoryboardListRun[] = results
          .flatMap<StoryboardListRun>((result) =>
            result.status === 'fulfilled' ? result.value : [],
          )
          .filter((run) => run.brandId === brandId);
        const failed = results.find((result) => result.status === 'rejected');
        setRuns((current) => {
          const combined = new Map<string, StoryboardListRun>();
          for (const run of [
            ...(page === 1 && !failed ? [] : current),
            ...pageRuns,
          ]) {
            const previous = combined.get(run.id);
            if (previous && 'state' in previous && 'phase' in run) continue;
            combined.set(run.id, run);
          }
          return [...combined.values()].sort(
            (a, b) =>
              b.updatedAt.localeCompare(a.updatedAt) ||
              a.id.localeCompare(b.id),
          );
        });
        setLoadedPage(page);
        setHasMore(
          results.some(
            (result) =>
              result.status === 'fulfilled' &&
              result.value.length === STORYBOARD_RUNS_PAGE_SIZE,
          ),
        );
        setError(
          failed?.status === 'rejected'
            ? getJsonApiErrorMessage(
                failed.reason,
                'Some storyboard runs could not be loaded. Retry to see every run.',
              )
            : null,
        );
      } catch (caughtError) {
        if (
          controller.signal.aborted ||
          (caughtError instanceof Error && caughtError.name === 'AbortError')
        ) {
          return;
        }
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'Storyboard runs could not be loaded.',
          ),
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [brandId, getContentRunsService, request, search]);

  const loadMore = useCallback(() => {
    setRequest((current) => ({
      attempt: current.attempt + 1,
      page: error ? current.page : loadedPage + 1,
    }));
  }, [error, loadedPage]);

  return {
    error,
    hasMore,
    isLoading,
    loadMore,
    runs: runs.filter((run) => run.brandId === brandId),
  };
}
