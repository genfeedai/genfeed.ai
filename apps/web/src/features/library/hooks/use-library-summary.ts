'use client';

import { LIBRARY_ASSETS_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import type { ILibrarySummary } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { getRequestOrganizationHeaders } from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { viewerKeyPart } from '@hooks/auth/use-authed-query/use-authed-query';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';

export interface UseLibrarySummaryReturn {
  summary: ILibrarySummary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
}

/**
 * Library sidebar counters — per-shelf counts, starred/trashed totals, and
 * total storage bytes for the active brand, or every brand on the organization
 * Library.
 *
 * `IngredientsService` has no client method for `GET /ingredients/summary`
 * yet, so this mirrors the raw-fetch idiom already used by
 * `useWorkflowBuilder` for endpoints without a service wrapper.
 *
 * Pass `isEnabled: false` where the counters are not shown (the admin Library
 * spans every organization, so one brand's counts would mislead).
 */
export function useLibrarySummary({
  isEnabled = true,
}: {
  isEnabled?: boolean;
} = {}): UseLibrarySummaryReturn {
  const collectionScope = useCollectionScope();
  const { brandId, organizationId, pageScope } = collectionScope;
  const isFetchReady = isCollectionFetchReady(collectionScope);
  const { getToken, orgId, userId } = useAuthIdentity();

  const queryKey = useMemo(
    () => [
      'library-summary',
      organizationId,
      brandId ?? null,
      pageScope,
      viewerKeyPart(userId, orgId),
    ],
    [brandId, orgId, organizationId, pageScope, userId],
  );

  const query = useQuery<ILibrarySummary, Error>({
    enabled: isFetchReady && isEnabled,
    queryFn: async ({ signal }) => {
      try {
        const token = await resolveAuthToken(getToken);
        const url = new URL(
          `${EnvironmentService.apiEndpoint}/ingredients/summary`,
        );
        if (brandId) {
          url.searchParams.set('brandId', brandId);
        } else if (pageScope === 'org') {
          url.searchParams.set('allBrands', 'true');
        }

        const response = await fetch(url.toString(), {
          headers: token
            ? {
                ...getRequestOrganizationHeaders(),
                Authorization: `Bearer ${token}`,
              }
            : undefined,
          signal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch library summary: ${response.status}`,
          );
        }

        return (await response.json()) as ILibrarySummary;
      } catch (caught) {
        const normalizedError =
          caught instanceof Error
            ? caught
            : new Error('Failed to load library summary');
        if (!signal.aborted) {
          logger.error(
            'useLibrarySummary: fetchSummary failed',
            normalizedError,
          );
        }
        throw normalizedError;
      }
    },
    queryKey,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const queryClient = useQueryClient();

  const isQueryEnabled = isFetchReady && isEnabled;
  const refresh = useCallback(() => {
    if (!isQueryEnabled) return;
    // A read still in flight predates the change, so it must not answer.
    void queryClient
      .cancelQueries({ queryKey })
      .then(() => queryClient.refetchQueries({ queryKey }));
  }, [isQueryEnabled, queryClient, queryKey]);

  // use-effect-audit: ignore subscribes to browser events
  useEffect(() => {
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
    return () =>
      window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, refresh);
  }, [refresh]);

  return {
    // A new attempt starts without the last failure on screen.
    error: query.isFetching ? null : query.error,
    isLoading: query.isPending || query.isFetching,
    refresh,
    summary: query.data ?? null,
  };
}
