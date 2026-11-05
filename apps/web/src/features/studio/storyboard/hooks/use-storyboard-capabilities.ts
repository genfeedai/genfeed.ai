'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback } from 'react';

/**
 * The video model metadata for one saved revision of a storyboard run. It is
 * cached per brand, run and revision, so reopening the run paints the last
 * metadata at once and refreshes it in the background; another revision never
 * sees it.
 */
export function useStoryboardCapabilities(runId: string, revision?: number) {
  const brandId = useBrandId();
  const query = useAuthedQuery<ContentRunsService, StoryboardRunCapabilities>({
    enabled: Boolean(brandId) && revision !== undefined,
    queryFn: async (service, signal) => {
      const capabilities = await service.getStoryboardRunCapabilities(
        brandId,
        runId,
        signal,
      );
      if (
        capabilities.runId !== runId ||
        capabilities.runRevision !== revision
      ) {
        throw new Error('Storyboard changed. Reload model capabilities.');
      }
      return capabilities;
    },
    queryKey: ['storyboard-capabilities', brandId, runId, revision ?? null],
    // A read for another revision is an answer, not a transient failure.
    retry: false,
    service: (token: string) => ContentRunsService.getInstance(token),
  });
  const { refetch } = query;
  const refreshCapabilities = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    // A failed read never leaves older metadata beside its error.
    capabilities: query.isError ? undefined : query.data,
    capabilityError: query.error
      ? getJsonApiErrorMessage(
          query.error,
          'Could not load video model capabilities.',
        )
      : undefined,
    refreshCapabilities,
  };
}
