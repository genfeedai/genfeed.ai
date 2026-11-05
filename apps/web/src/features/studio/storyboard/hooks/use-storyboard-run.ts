'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
  PreparePausedMetaCampaignDraft,
} from '@genfeedai/contracts/api-types/contracts';
import type { QuoteBrandRemixScenes } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolvePairedRunIdentity } from '@/features/studio/storyboard/utils/storyboard-run';

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

function storyboardRunQueryKey(brandId: string, runId: string) {
  return ['brand-remix-run', brandId, runId] as const;
}

/** The highest revision of `run` among it and the cached copies of it. */
function newestRun(
  run: BrandRemixRunView,
  cached: ReadonlyArray<readonly [unknown, BrandRemixRunView | undefined]>,
): BrandRemixRunView {
  return cached.reduce<BrandRemixRunView>(
    (newest, [, candidate]) =>
      candidate &&
      candidate.id === newest.id &&
      candidate.brandId === newest.brandId &&
      candidate.revision > newest.revision
        ? candidate
        : newest,
    run,
  );
}

/**
 * One Discovery storyboard run of the active brand. It is cached per brand and
 * run, so reopening the run paints it at once and refreshes it in the
 * background; while generation is in flight it re-reads every few seconds.
 * Actions write the run they return into the cache. A failed read replaces
 * the run only when none is on screen.
 */
export function useStoryboardRun(runId: string): UseStoryboardRunResult {
  const brandId = useBrandId();
  const router = useRouter();
  const { activeHref } = useOrgUrl();
  const queryClient = useQueryClient();
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
  const [action, setAction] = useState<{
    error: string | null;
    /** The run read on screen when the action failed; a later read supersedes the error. */
    readAt: number;
    isWorking: boolean;
    scope: string;
  }>({ error: null, readAt: 0, isWorking: false, scope });

  const runQuery = useAuthedQuery<ContentRunsService, BrandRemixRunView>({
    enabled: Boolean(brandId),
    queryFn: async (service, signal) => {
      // A read superseded while it waited for its token never reaches the API.
      signal.throwIfAborted();
      const nextRun = await service.findBrandRemixRun(runId, signal);
      if (nextRun.brandId !== brandId)
        throw new Error('Storyboard is unavailable in this brand.');
      // An action that returned a newer revision while this read was in
      // flight wins over it.
      return newestRun(
        nextRun,
        queryClient.getQueriesData<BrandRemixRunView>({
          queryKey: storyboardRunQueryKey(brandId, runId),
        }),
      );
    },
    queryKey: storyboardRunQueryKey(brandId, runId),
    refetchInterval: (query) =>
      query.state.data && isStoryboardRunInFlight(query.state.data)
        ? RUN_REFRESH_MS
        : false,
    service: (token: string) => ContentRunsService.getInstance(token),
  });
  const readAtRef = useRef(0);
  readAtRef.current = runQuery.dataUpdatedAt;
  const cachedRun = runQuery.data;
  const run = cachedRun?.brandId === brandId ? cachedRun : null;

  const { refetch } = runQuery;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const socketAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          run?.execution?.variants.flatMap((variant) => variant.assetIds) ?? [],
        ),
      ).sort(),
    [run?.execution?.variants],
  );
  const socketResource = run ? getSocketResource(run) : null;

  useEffect(() => {
    if (!socketResource || !isSocketReady || !socketAssetIds.length) {
      return;
    }

    const unsubscribe = socketAssetIds.map((assetId) =>
      subscribe(`/${socketResource}/${assetId}`, () => {
        void refresh();
      }),
    );
    return () => {
      for (const dispose of unsubscribe) {
        dispose();
      }
    };
  }, [isSocketReady, refresh, socketAssetIds, socketResource, subscribe]);

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
      setAction({ error: null, readAt: 0, isWorking: true, scope });
      try {
        const nextRun = await operation();
        if (activeScope.current !== scope) return null;
        if (nextRun.brandId !== brandId)
          throw new Error('Storyboard is unavailable in this brand.');
        const runKey = storyboardRunQueryKey(brandId, nextRun.id);
        // A read already in flight must not land over the action's result.
        await queryClient.cancelQueries({ queryKey: runKey });
        queryClient.setQueriesData<BrandRemixRunView>(
          { queryKey: runKey },
          (current) =>
            current ? newestRun(nextRun, [[runKey, current]]) : nextRun,
        );
        setAction({ error: null, readAt: 0, isWorking: false, scope });
        return nextRun;
      } catch (caughtError) {
        if (activeScope.current !== scope) return null;
        setAction({
          error: getJsonApiErrorMessage(
            caughtError,
            'The storyboard run could not be updated.',
          ),
          readAt: readAtRef.current,
          isWorking: false,
          scope,
        });
        return null;
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [scope, brandId, run, queryClient],
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

  // A failed action's message stays until a later read of the run lands.
  const currentAction =
    action.scope === scope &&
    (action.isWorking || runQuery.dataUpdatedAt === action.readAt)
      ? action
      : { error: null, readAt: 0, isWorking: false, scope };
  const readError = runQuery.error
    ? getJsonApiErrorMessage(
        runQuery.error,
        'The storyboard run could not be updated.',
      )
    : null;
  const error = currentAction.error ?? readError;
  const status: StoryboardRunStatus = currentAction.isWorking
    ? 'working'
    : error
      ? 'error'
      : run
        ? 'ready'
        : 'loading';

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
    run,
    runId,
    start,
    status,
    submitForReview,
    vary,
  };
}
