'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Neutral persisted drafts use the brand-scoped API, never a local run substitute. */
export function useDurableStoryboardRun(runId: string) {
  const brandId = useBrandId();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const scope = `${brandId}:${runId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const [result, setResult] = useState<{
    scope: string;
    run: StoryboardRun | null;
    error: string | null;
  }>({ scope, run: null, error: null });
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the explicit retry trigger.
  useEffect(() => {
    const controller = new AbortController();
    setResult({ scope, run: null, error: null });
    if (brandId)
      void getService()
        .then((service) =>
          service.getStoryboardRun(brandId, runId, controller.signal),
        )
        .then((run) => {
          if (run.brandId !== brandId || run.id !== runId)
            throw new Error('Storyboard scope changed.');
          if (!controller.signal.aborted)
            setResult({ scope, run, error: null });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              run: null,
              error: getJsonApiErrorMessage(
                error,
                'Could not load storyboard.',
              ),
            });
        });
    return () => controller.abort();
  }, [brandId, runId, scope, getService, attempt]);

  const adopt = useCallback(
    (run: StoryboardRun) => {
      if (
        activeScope.current !== scope ||
        run.brandId !== brandId ||
        run.id !== runId
      )
        throw new Error('Storyboard scope changed.');
      setResult((current) =>
        current.scope === scope &&
        (!current.run || run.config.revision >= current.run.config.revision)
          ? { scope, run, error: null }
          : current,
      );
      return run;
    },
    [scope, brandId, runId],
  );
  const savePlan = useCallback(
    async (revision: number, plan: StoryboardPlan, signal: AbortSignal) => {
      if (!brandId || signal.aborted)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      const run = await service.updateStoryboardPlan(brandId, runId, {
        expectedRevision: revision,
        plan,
      });
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      return adopt(run);
    },
    [brandId, runId, getService, adopt],
  );
  const resetPlan = useCallback(
    async (revision: number) => {
      if (!brandId) throw new Error('Choose a brand.');
      return adopt(
        await (await getService()).resetStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt],
  );
  const approvePlan = useCallback(
    async (revision: number) => {
      if (!brandId) throw new Error('Choose a brand.');
      return adopt(
        await (await getService()).approveStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt],
  );
  return {
    run: result.scope === scope ? result.run : null,
    error: result.scope === scope ? result.error : null,
    refresh: () => setAttempt((value) => value + 1),
    savePlan,
    resetPlan,
    approvePlan,
  };
}
