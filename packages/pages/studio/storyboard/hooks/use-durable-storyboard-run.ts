'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { StoryboardSourceSelector } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { requiresStoryboardTimingCapabilities } from '@pages/studio/storyboard/utils/storyboard-capabilities';
import { ContentRunsService } from '@services/content/content-runs.service';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
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
    notFound: boolean;
  }>({ scope, run: null, error: null, notFound: false });
  const latestRun = useRef<StoryboardRun | null>(null);
  latestRun.current = result.scope === scope ? result.run : null;
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the explicit retry trigger.
  useEffect(() => {
    const controller = new AbortController();
    setResult({ scope, run: null, error: null, notFound: false });
    if (brandId)
      void getService()
        .then((service) =>
          service.getStoryboardRun(brandId, runId, controller.signal),
        )
        .then((run) => {
          if (run.brandId !== brandId || run.id !== runId)
            throw new Error('Storyboard scope changed.');
          if (!controller.signal.aborted)
            setResult({ scope, run, error: null, notFound: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              scope,
              run: null,
              notFound: getJsonApiErrorMember(error)?.status === 404,
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
      latestRun.current = run;
      setResult((current) =>
        current.scope === scope &&
        (!current.run || run.config.revision >= current.run.config.revision)
          ? { scope, run, error: null, notFound: false }
          : current,
      );
      return run;
    },
    [scope, brandId, runId],
  );
  const savePlan = useCallback(
    async (
      revision: number,
      plan: StoryboardPlan,
      signal: AbortSignal,
      capabilityVersion?: string,
    ) => {
      if (!brandId || signal.aborted)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      const persisted = latestRun.current;
      if (
        activeScope.current !== scope ||
        persisted?.config.revision !== revision
      )
        throw new Error('Storyboard changed. Reload before saving.');
      const timingChanged = requiresStoryboardTimingCapabilities(
        persisted.config.plan,
        plan,
      );
      if (timingChanged && !capabilityVersion)
        throw new Error(
          'Reload model capabilities before saving timing changes.',
        );
      const run = await service.updateStoryboardPlan(brandId, runId, {
        expectedRevision: revision,
        plan,
        ...(timingChanged ? { capabilityVersion } : {}),
      });
      if (signal.aborted) throw new Error('Storyboard scope changed.');
      return adopt(run);
    },
    [brandId, runId, getService, adopt, scope],
  );
  const saveSource = useCallback(
    async (revision: number, source: StoryboardSourceSelector) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.updateStoryboardSource(brandId, runId, {
          expectedRevision: revision,
          source,
        }),
      );
    },
    [brandId, scope, getService, runId, adopt],
  );
  const resetPlan = useCallback(
    async (revision: number) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.resetStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt, scope],
  );
  const approvePlan = useCallback(
    async (revision: number) => {
      if (!brandId || activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      const service = await getService();
      if (activeScope.current !== scope)
        throw new Error('Storyboard scope changed.');
      return adopt(
        await service.approveStoryboardPlan(brandId, runId, {
          expectedRevision: revision,
        }),
      );
    },
    [brandId, runId, getService, adopt, scope],
  );
  return {
    run: result.scope === scope ? result.run : null,
    error: result.scope === scope ? result.error : null,
    notFound: result.scope === scope && result.notFound,
    refresh: () => setAttempt((value) => value + 1),
    savePlan,
    saveSource,
    resetPlan,
    approvePlan,
  };
}
