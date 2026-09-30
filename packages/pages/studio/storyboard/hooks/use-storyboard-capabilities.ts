'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { StoryboardRunCapabilities } from '@genfeedai/contracts/api-types/contracts/storyboard-run-capabilities.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback, useEffect, useState } from 'react';

export function useStoryboardCapabilities(runId: string, revision?: number) {
  const brandId = useBrandId();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const scope = `${brandId}:${runId}:${revision}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    capabilities?: StoryboardRunCapabilities;
    error?: string;
  }>();
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly reloads catalog metadata.
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    if (brandId && revision !== undefined)
      void getService()
        .then((service) =>
          service.getStoryboardRunCapabilities(
            brandId,
            runId,
            controller.signal,
          ),
        )
        .then((capabilities) => {
          if (
            capabilities.runId !== runId ||
            capabilities.runRevision !== revision
          )
            throw new Error('Storyboard changed. Reload model capabilities.');
          if (!controller.signal.aborted) setResult({ scope, capabilities });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              error: getJsonApiErrorMessage(
                error,
                'Could not load video model capabilities.',
              ),
            });
        });
    return () => controller.abort();
  }, [brandId, runId, revision, scope, getService, attempt]);
  return {
    capabilities: result?.scope === scope ? result.capabilities : undefined,
    capabilityError: result?.scope === scope ? result.error : undefined,
    refreshCapabilities: refresh,
  };
}
