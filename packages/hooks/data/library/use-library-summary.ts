'use client';

import type { ILibrarySummary } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useCallback, useEffect, useState } from 'react';

export interface UseLibrarySummaryReturn {
  summary: ILibrarySummary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Library sidebar counters — per-shelf counts, starred/trashed totals, and
 * total storage bytes for the active brand.
 *
 * `IngredientsService` has no client method for `GET /ingredients/summary`
 * yet, so this mirrors the raw-fetch idiom already used by
 * `useWorkflowBuilder` for endpoints without a service wrapper.
 */
export function useLibrarySummary(): UseLibrarySummaryReturn {
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isFetchReady = isCollectionFetchReady(collectionScope);
  const { getToken } = useAuthIdentity();
  const [summary, setSummary] = useState<ILibrarySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadToken is the refresh trigger, not a value the effect reads.
  useEffect(() => {
    if (!isFetchReady) {
      return;
    }

    const controller = new AbortController();

    async function fetchSummary() {
      setIsLoading(true);
      setError(null);

      try {
        const token = await resolveAuthToken(getToken);
        const url = new URL(
          `${EnvironmentService.apiEndpoint}/ingredients/summary`,
        );
        if (brandId) {
          url.searchParams.set('brandId', brandId);
        }

        const response = await fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch library summary: ${response.status}`,
          );
        }

        const data = (await response.json()) as ILibrarySummary;

        if (!controller.signal.aborted) {
          setSummary(data);
        }
      } catch (caught) {
        if (
          controller.signal.aborted ||
          (caught instanceof Error && caught.name === 'AbortError')
        ) {
          return;
        }

        const normalizedError =
          caught instanceof Error
            ? caught
            : new Error('Failed to load library summary');
        setError(normalizedError);
        logger.error('useLibrarySummary: fetchSummary failed', normalizedError);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchSummary();

    return () => {
      controller.abort();
    };
  }, [brandId, getToken, isFetchReady, reloadToken]);

  return { summary, isLoading, error, refresh };
}
