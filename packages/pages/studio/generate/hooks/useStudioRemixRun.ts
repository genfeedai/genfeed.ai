'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
  PreparePausedMetaCampaignDraft,
} from '@genfeedai/contracts/api-types/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { resolvePairedRemixIdentity } from '@pages/studio/generate/utils/studio-remix-run';
import { parseStudioRemixRunId } from '@pages/studio/generate/utils/studio-remix-run-url';
import { ContentRunsService } from '@services/content/content-runs.service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REMIX_RUN_REFRESH_MS = 3_000;
const IN_FLIGHT_PHASES = new Set<BrandRemixRunView['phase']>([
  'generating',
  'paid_draft_creating',
  'partially_ready',
]);

export type StudioRemixRunStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'working'
  | 'error';

export interface UseStudioRemixRunResult {
  readonly error: string | null;
  readonly preparePausedDraft: (
    input: PreparePausedMetaCampaignDraft,
  ) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly run: BrandRemixRunView | null;
  readonly runId: string | null;
  readonly start: (edits: BrandRemixDraftEdits) => Promise<void>;
  readonly status: StudioRemixRunStatus;
  readonly submitForReview: (variantIds?: string[]) => Promise<void>;
  readonly vary: () => Promise<void>;
}

function buildVaryEdits(run: BrandRemixRunView): BrandRemixDraftEdits {
  const { draft } = run;
  const canonicalIdentity = resolvePairedRemixIdentity(draft.identity);
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

export function useStudioRemixRun(): UseStudioRemixRunResult {
  const brandId = useBrandId();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const runId = useMemo(
    () => parseStudioRemixRunId(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const router = useRouter();
  const { activeHref } = useOrgUrl();
  const { isReady: isSocketReady, subscribe } = useSocketManager();
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const actionInFlightRef = useRef(false);
  const [run, setRun] = useState<BrandRemixRunView | null>(null);
  const [status, setStatus] = useState<StudioRemixRunStatus>(
    runId ? 'loading' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(
    async (signal?: AbortSignal) => {
      if (!runId) {
        setRun(null);
        setStatus('idle');
        setError(null);
        return;
      }

      try {
        const service = await getContentRunsService();
        const nextRun = await service.findBrandRemixRun(runId, signal);
        if (signal?.aborted) {
          return;
        }
        setRun(nextRun);
        setStatus('ready');
        setError(null);
      } catch (caughtError) {
        if (
          signal?.aborted ||
          (caughtError instanceof Error && caughtError.name === 'AbortError')
        ) {
          return;
        }
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The remix run could not be updated.',
          ),
        );
        setStatus('error');
      }
    },
    [getContentRunsService, runId],
  );

  const refresh = useCallback(async () => {
    await fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    const controller = new AbortController();
    setStatus(runId ? 'loading' : 'idle');
    void fetchRun(controller.signal);
    return () => controller.abort();
  }, [fetchRun, runId]);

  useEffect(() => {
    if (!run || !IN_FLIGHT_PHASES.has(run.phase)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchRun(controller.signal);
    }, REMIX_RUN_REFRESH_MS);
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
      if (actionInFlightRef.current) {
        return null;
      }

      actionInFlightRef.current = true;
      setStatus('working');
      setError(null);
      try {
        const nextRun = await operation();
        setRun(nextRun);
        setStatus('ready');
        return nextRun;
      } catch (caughtError) {
        setError(
          getJsonApiErrorMessage(
            caughtError,
            'The remix run could not be updated.',
          ),
        );
        setStatus('error');
        return null;
      } finally {
        actionInFlightRef.current = false;
      }
    },
    [],
  );

  const start = useCallback(
    async (edits: BrandRemixDraftEdits) => {
      if (!run) {
        return;
      }

      await perform(async () => {
        const service = await getContentRunsService();
        const revisedRun = await service.reviseBrandRemixRun(run.id, {
          edits,
          expectedRevision: run.revision,
        });
        if (revisedRun.readiness.state === 'blocked') {
          return revisedRun;
        }
        return await service.startBrandRemixRun(revisedRun.id, {
          expectedRevision: revisedRun.revision,
        });
      });
    },
    [getContentRunsService, perform, run],
  );

  const vary = useCallback(async () => {
    if (!run || !brandId) {
      return;
    }

    const variedRun = await perform(async () => {
      const service = await getContentRunsService();
      return await service.createBrandRemixRun(brandId, {
        edits: buildVaryEdits(run),
        source: run.sourceSnapshot.selector,
      });
    });
    if (!variedRun) {
      return;
    }

    router.replace(
      activeHref(
        `${APP_ROUTES.STUDIO.GENERATE}?run=${encodeURIComponent(variedRun.id)}`,
      ),
    );
  }, [activeHref, brandId, getContentRunsService, perform, router, run]);

  const submitForReview = useCallback(
    async (variantIds?: string[]) => {
      if (!run) {
        return;
      }
      await perform(async () => {
        const service = await getContentRunsService();
        return await service.submitBrandRemixRunForReview(run.id, {
          ...(variantIds?.length ? { variantIds } : {}),
        });
      });
    },
    [getContentRunsService, perform, run],
  );

  const preparePausedDraft = useCallback(
    async (input: PreparePausedMetaCampaignDraft) => {
      if (!run) {
        return;
      }
      await perform(async () => {
        const service = await getContentRunsService();
        return await service.prepareBrandRemixPausedDraft(run.id, input);
      });
    },
    [getContentRunsService, perform, run],
  );

  return {
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
