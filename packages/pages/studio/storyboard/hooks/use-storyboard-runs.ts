'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback, useEffect, useState } from 'react';

export const STORYBOARD_RUNS_PAGE_SIZE = 50;

export interface UseStoryboardRunsResult {
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  /** Loads the next page, or retries the page that last failed. */
  readonly loadMore: () => void;
  readonly runs: BrandRemixRunSummary[];
}

/** Studio → Storyboard saved runs for the active brand, newest edit first. */
export function useStoryboardRuns(): UseStoryboardRunsResult {
  const brandId = useBrandId();
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const [runs, setRuns] = useState<BrandRemixRunSummary[]>([]);
  const [request, setRequest] = useState({ attempt: 0, page: 1 });
  const [loadedPage, setLoadedPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A brand switch starts the list over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: brandId is the reset trigger.
  useEffect(() => {
    setRuns([]);
    setLoadedPage(0);
    setRequest((current) =>
      current.page === 1 && current.attempt === 0
        ? current
        : { attempt: 0, page: 1 },
    );
  }, [brandId]);

  useEffect(() => {
    if (!brandId) {
      return;
    }
    const controller = new AbortController();
    const { page } = request;
    setIsLoading(true);

    const load = async () => {
      try {
        const service = await getContentRunsService();
        const pageRuns = await service.listBrandRemixRuns(
          brandId,
          { limit: STORYBOARD_RUNS_PAGE_SIZE, page },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setRuns((current) =>
          page === 1
            ? pageRuns
            : [
                ...current,
                ...pageRuns.filter(
                  (run) => !current.some((prior) => prior.id === run.id),
                ),
              ],
        );
        setLoadedPage(page);
        setHasMore(pageRuns.length === STORYBOARD_RUNS_PAGE_SIZE);
        setError(null);
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
  }, [brandId, getContentRunsService, request]);

  const loadMore = useCallback(() => {
    setRequest((current) => ({
      attempt: current.attempt + 1,
      page: error ? current.page : loadedPage + 1,
    }));
  }, [error, loadedPage]);

  return { error, hasMore, isLoading, loadMore, runs };
}
