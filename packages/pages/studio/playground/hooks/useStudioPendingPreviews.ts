import { IngredientStatus } from '@genfeedai/contracts';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import type { IngredientsService } from '@services/content/ingredients.service';
import { useEffect, useMemo, useRef } from 'react';

const MAX_POLL_ATTEMPTS = 40;

/** Seconds-scale backoff: a watermarked preview takes a worker, not a request. */
function pollDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
}

/**
 * A saved asset whose preview the API has not issued yet. The grid card shows
 * "Preview unavailable" for these and never asks again, while the Library
 * re-reads until the watermarked preview is ready.
 */
export function isStudioPreviewPending(job: StudioPlaygroundJob): boolean {
  return (
    !job.url &&
    job.status !== IngredientStatus.FAILED &&
    job.status !== IngredientStatus.PROCESSING &&
    job.status !== IngredientStatus.DRAFT &&
    job.ingredient?.mediaDelivery?.state === 'PENDING'
  );
}

interface UseStudioPendingPreviewsParams {
  getIngredientsService: () => Promise<IngredientsService>;
  jobs: readonly StudioPlaygroundJob[];
  recoverPreview: (job: StudioPlaygroundJob, recoveredUrl: string) => void;
}

/**
 * Re-reads the authorized preview of every grid asset still pending, which
 * also asks the API to prepare it, and hands each ready URL back to its card.
 * It stops per asset on a ready, failed or unsupported grant, and overall
 * after a bounded number of attempts.
 */
export function useStudioPendingPreviews({
  getIngredientsService,
  jobs,
  recoverPreview,
}: UseStudioPendingPreviewsParams): void {
  const pendingJobs = useMemo(() => jobs.filter(isStudioPreviewPending), [jobs]);
  const pendingKey = pendingJobs.map((job) => job.id).join('\u0001');
  const pendingJobsRef = useRef(pendingJobs);
  pendingJobsRef.current = pendingJobs;

  useEffect(() => {
    if (!pendingKey) return;
    const controller = new AbortController();
    const settledIds = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const poll = async () => {
      if (controller.signal.aborted) return;
      attempts += 1;
      const remaining = pendingJobsRef.current.filter(
        (job) => !settledIds.has(job.id),
      );
      try {
        const service = await getIngredientsService();
        const grants = await Promise.all(
          remaining.map((job) =>
            service.previewGrant(job.ingredientId ?? job.id, controller.signal),
          ),
        );
        if (controller.signal.aborted) return;
        grants.forEach((grant, index) => {
          const job = remaining[index];
          if (!grant) return;
          if (grant.state === 'READY' && grant.url) {
            settledIds.add(job.id);
            recoverPreview(job, grant.url);
          } else if (grant.state === 'FAILED' || grant.state === 'UNSUPPORTED') {
            // Terminal: the card keeps its fallback and the Inspector offers Retry.
            settledIds.add(job.id);
          }
        });
      } catch {
        // A failed read is retried on the next attempt.
      }
      if (
        controller.signal.aborted ||
        attempts >= MAX_POLL_ATTEMPTS ||
        remaining.every((job) => settledIds.has(job.id))
      )
        return;
      timer = setTimeout(() => void poll(), pollDelayMs(attempts));
    };

    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [getIngredientsService, pendingKey, recoverPreview]);
}
