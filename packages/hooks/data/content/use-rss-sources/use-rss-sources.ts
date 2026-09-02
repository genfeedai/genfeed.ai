'use client';

import type {
  CreateRssSourceInput,
  IRssSource,
  UpdateRssSourceInput,
} from '@genfeedai/contracts/interfaces';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type {
  UseRssSourcesOptions,
  UseRssSourcesResult,
} from '@props/scheduler/rss-sources-section.props';
import { RssSourcesService } from '@services/content/rss-sources.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export const RSS_SOURCES_QUERY_KEY = 'rss-sources';

export function useRssSources(
  options: UseRssSourcesOptions = {},
): UseRssSourcesResult {
  const { autoLoad = true, brandId: providedBrandId } = options;
  const { isSignedIn } = useAuthIdentity();
  const { brandId: scopedBrandId } = useCollectionScope();
  const brandId = providedBrandId ?? scopedBrandId;
  const queryClient = useQueryClient();

  const getService = useAuthedService((token: string) =>
    RssSourcesService.getInstance(token),
  );

  const queryKey = useMemo(() => [RSS_SOURCES_QUERY_KEY, brandId], [brandId]);

  const {
    data = [],
    error,
    isLoading,
    refetch,
  } = useQuery<IRssSource[]>({
    enabled: autoLoad && !!isSignedIn && !!brandId,
    queryFn: async ({ signal }) => {
      if (!brandId) {
        return [];
      }
      const service = await getService();
      return service.findAll({ brandId }, signal);
    },
    queryKey,
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: [RSS_SOURCES_QUERY_KEY],
    });
  }, [queryClient]);

  const create = useCallback(
    async (input: CreateRssSourceInput): Promise<IRssSource> => {
      const service = await getService();
      const created = await service.post({
        ...input,
        brandId: input.brandId ?? brandId,
      });
      await invalidate();
      return created;
    },
    [brandId, getService, invalidate],
  );

  const update = useCallback(
    async (id: string, input: UpdateRssSourceInput): Promise<IRssSource> => {
      const service = await getService();
      const updated = await service.patch(id, input);
      await invalidate();
      return updated;
    },
    [getService, invalidate],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const service = await getService();
      await service.delete(id);
      await invalidate();
    },
    [getService, invalidate],
  );

  const pollNow = useCallback(
    async (id: string): Promise<IRssSource> => {
      const service = await getService();
      const polled = await service.pollNow(id);
      await invalidate();
      return polled;
    },
    [getService, invalidate],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    create,
    error: error instanceof Error ? error : null,
    isLoading,
    pollNow,
    refresh,
    remove,
    sources: data,
    update,
  };
}
