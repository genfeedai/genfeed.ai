'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
  PreparePausedMetaCampaignDraft,
} from '@genfeedai/contracts/api-types/contracts';
import type { QuoteBrandRemixScenes } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { resolvePairedRunIdentity } from '@pages/studio/storyboard/utils/storyboard-run';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const RUN_REFRESH_MS = 3_000;
const IN_FLIGHT_PHASES = new Set<BrandRemixRunView['phase']>([
  'generating',
  'paid_draft_creating',
  'partially_ready',
]);

const IN_FLIGHT_SCENE_STATES = new Set([
  'analysing',
  'generating',
  'assembling',
]);

/**
 * A run keeps refreshing while generation is in flight, including provider
 * scene work still being recorded after a cancellation.
 */
function isStoryboardRunInFlight(run: BrandRemixRunView): boolean {
  const pipeline = run.scenePipeline;
  if (IN_FLIGHT_PHASES.has(run.phase)) return true;
  if (!pipeline) return false;
  return (
    IN_FLIGHT_SCENE_STATES.has(pipeline.state) ||
    Object.values(pipeline.scenes).some((scene) =>
      [scene.image.state, scene.video.state].some(
        (state) => state === 'claimed' || state === 'submitted',
      ),
    )
  );
}

export type StoryboardRunStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'working'
  | 'error';

export interface UseStoryboardRunResult {
  readonly saveScenes: (edits: BrandRemixDraftEdits) => Promise<void>;
  readonly attachSceneSource: (assetId: string | null) => Promise<void>;
  readonly quoteScenes: (
    input: Omit<QuoteBrandRemixScenes, 'expectedRevision'>,
  ) => Promise<void>;
  readonly executeScenes: () => Promise<void>;
  readonly cancelScenes: () => Promise<void>;
  readonly resumeScenes: () => Promise<void>;
  readonly error: string | null;
  readonly preparePausedDraft: (
    input: PreparePausedMetaCampaignDraft,
  ) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly run: BrandRemixRunView | null;
  readonly runId: string;
  readonly start: (edits: BrandRemixDraftEdits) => Promise<void>;
  readonly status: StoryboardRunStatus;
  readonly submitForReview: (variantIds?: string[]) => Promise<void>;
  readonly vary: () => Promise<void>;
}

function buildVaryEdits(run: BrandRemixRunView): BrandRemixDraftEdits {
  const { draft } = run;
  const canonicalIdentity = resolvePairedRunIdentity(draft.identity);
  return {
    fidelityMode: draft.fidelityMode,
    ...(canonicalIdentity ? { identity: canonicalIdentity } : {}),
    intent: draft.intent,
    output:
      draft.output.kind === 'copy'
        ? { count: draft.output.count, kind: 'copy' }
        : {
            aspectRatio: draft.output.aspectRatio,
            count: draft.output.count,
            kind: draft.output.kind,
            ...(draft.output.kind === 'image'
              ? { durationSeconds: null }
              : draft.output.durationSeconds
                ? { durationSeconds: draft.output.durationSeconds }
                : {}),
          },
    references: draft.references
      .filter((reference) => reference.source === 'explicit')
      .map((reference) => ({
        assetId: reference.assetId,
        ...(reference.description
          ? { description: reference.description }
          : {}),
        role: reference.role,
      })),
    target: draft.target,
  };
}

function getSocketResource(run: BrandRemixRunView): 'images' | 'videos' {
  return run.draft.output.kind === 'image' ? 'images' : 'videos';
}

export function useStoryboardRun(runId: string): UseStoryboardRunResult {
  const brandId = useBrandId();
  const router = useRouter();
  const { activeHref } = useOrgUrl();
  const { isReady: isSocketReady, subscribe } = useSocketManager();
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const scope = `${brandId}:${runId}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const getScopedService = useCallback(async () => {
    const service = await getContentRunsService();
    if (activeScope.current !== scope)
      throw new Error('Storyboard scope changed.');
    return service;
  }, [getContentRunsService, scope]);
  const actionInFlightRef = useRef(false);
  const [run, setRun] = useState<BrandRemixRunView | null>(null);
  const [status, setStatus] = useState<StoryboardRunStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getScopedService();
        const nextRun = await service.findBrandRemixRun(runId, signal);
        if (signal?.aborted) {
          return;
        }
        if (activeScope.current !== scope) return;
        if (nextRun.brandId !== brandId)
          throw new Error('Storyboard is unavailable in this brand.');
        setRun(nextRun);
        setStatus('ready');
        setError(null);
      } catch (caughtError) {
        if (
          activeScope.current !== scope ||
          signal?.aborted ||
          (caughtError instanceof Error && caughtError.name === 'AbortError')
        ) {
          return;
        }
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The storyboard run could not be updated.',
          ),
        );
        setStatus('error');
      }
    },
    [getScopedService, runId, brandId, scope],
  );

  const refresh = useCallback(async () => {
    await fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    const controller = new AbortController();
    setRun(null);
    setError(null);
    setStatus('loading');
    void fetchRun(controller.signal);
    return () => controller.abort();
  }, [fetchRun]);

  useEffect(() => {
    if (!run || !isStoryboardRunInFlight(run)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchRun(controller.signal);
    }, RUN_REFRESH_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [fetchRun, run]);

  const socketAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          run?.execution?.variants.flatMap((variant) => variant.assetIds) ?? [],
        ),
      ).sort(),
    [run?.execution?.variants],
  );

  useEffect(() => {
    if (!run || !isSocketReady || !socketAssetIds.length) {
      return;
    }

    const resource = getSocketResource(run);
    const unsubscribe = socketAssetIds.map((assetId) =>
      subscribe(`/${resource}/${assetId}`, () => {
        void refresh();
      }),
    );
    return () => {
      for (const dispose of unsubscribe) {
        dispose();
      }
    };
  }, [isSocketReady, refresh, run, socketAssetIds, subscribe]);

  const perform = useCallback(
    async (operation: () => Promise<BrandRemixRunView>) => {
      if (
        actionInFlightRef.current ||
        activeScope.current !== scope ||
        (run && run.brandId !== brandId)
      ) {
        return null;
      }

      actionInFlightRef.current = true;
      setStatus('working');
      setError(null);
      try {
        const nextRun = await operation();
        if (activeScope.current !== scope) return null;
        if (nextRun.brandId !== brandId)
          throw new Error('Storyboard is unavailable in this brand.');
        setRun(nextRun);
        setStatus('ready');
        return nextRun;
      } catch (caughtError) {
        if (activeScope.current !== scope) return null;
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The storyboard run could not be updated.',
          ),
        );
        setStatus('error');
        return null;
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [scope, brandId, run],
  );

  const start = useCallback(
    async (edits: BrandRemixDraftEdits) => {
      if (!run) {
        return;
      }

      await perform(async () => {
        const service = await getScopedService();
        const revisedRun = await service.reviseBrandRemixRun(run.id, {
          edits,
          expectedRevision: run.revision,
        });
        if (revisedRun.readiness.state === 'blocked') {
          return revisedRun;
        }
        if (
          revisedRun.scenePipeline ||
          (['video', 'avatar'].includes(revisedRun.draft.output.kind) &&
            (revisedRun.concept?.storyboard.length ?? 0) > 1)
        )
          return await service.quoteBrandRemixScenes(revisedRun.id, {
            expectedRevision: revisedRun.revision,
            operation: 'generate',
          });
        return await service.startBrandRemixRun(revisedRun.id, {
          expectedRevision: revisedRun.revision,
        });
      });
    },
    [getScopedService, perform, run],
  );

  const saveScenes = useCallback(
    async (edits: BrandRemixDraftEdits) => {
      if (run)
        await perform(async () =>
          (await getScopedService()).reviseBrandRemixRun(run.id, {
            expectedRevision: run.revision,
            edits,
          }),
        );
    },
    [run, perform, getScopedService],
  );
  const attachSceneSource = useCallback(
    async (assetId: string | null) => {
      if (run)
        await perform(async () =>
          (await getScopedService()).attachBrandRemixAnalysisSource(run.id, {
            expectedRevision: run.revision,
            assetId,
          }),
        );
    },
    [run, perform, getScopedService],
  );
  const quoteScenes = useCallback(
    async (input: Omit<QuoteBrandRemixScenes, 'expectedRevision'>) => {
      if (run)
        await perform(async () =>
          (await getScopedService()).quoteBrandRemixScenes(run.id, {
            ...input,
            expectedRevision: run.revision,
          }),
        );
    },
    [run, perform, getScopedService],
  );
  const executeScenes = useCallback(async () => {
    const quoteId = run?.scenePipeline?.quote?.id;
    if (run && quoteId)
      await perform(async () =>
        (await getScopedService()).executeBrandRemixScenes(run.id, {
          expectedRevision: run.revision,
          quoteId,
        }),
      );
  }, [run, perform, getScopedService]);
  const cancelScenes = useCallback(async () => {
    if (run)
      await perform(async () =>
        (await getScopedService()).cancelBrandRemixScenes(run.id, {
          expectedRevision: run.revision,
        }),
      );
  }, [run, perform, getScopedService]);
  const resumeScenes = useCallback(async () => {
    if (run)
      await perform(async () =>
        (await getScopedService()).resumeBrandRemixScenes(run.id, {
          expectedRevision: run.revision,
        }),
      );
  }, [run, perform, getScopedService]);

  const vary = useCallback(async () => {
    if (!run || !brandId) {
      return;
    }

    const variedRun = await perform(async () => {
      const service = await getScopedService();
      return await service.createBrandRemixRun(brandId, {
        edits: buildVaryEdits(run),
        source: run.sourceSnapshot.selector,
      });
    });
    if (!variedRun) {
      return;
    }

    router.push(
      activeHref(
        `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(variedRun.id)}`,
      ),
    );
  }, [activeHref, brandId, getScopedService, perform, router, run]);

  const submitForReview = useCallback(
    async (variantIds?: string[]) => {
      if (!run) {
        return;
      }
      await perform(async () => {
        const service = await getScopedService();
        return await service.submitBrandRemixRunForReview(run.id, {
          ...(variantIds?.length ? { variantIds } : {}),
        });
      });
    },
    [getScopedService, perform, run],
  );

  const preparePausedDraft = useCallback(
    async (input: PreparePausedMetaCampaignDraft) => {
      if (!run) {
        return;
      }
      await perform(async () => {
        const service = await getScopedService();
        return await service.prepareBrandRemixPausedDraft(run.id, input);
      });
    },
    [getScopedService, perform, run],
  );

  return {
    saveScenes,
    attachSceneSource,
    quoteScenes,
    executeScenes,
    cancelScenes,
    resumeScenes,
    error,
    preparePausedDraft,
    refresh,
    run: run?.brandId === brandId ? run : null,
    runId,
    start,
    status,
    submitForReview,
    vary,
  };
}
