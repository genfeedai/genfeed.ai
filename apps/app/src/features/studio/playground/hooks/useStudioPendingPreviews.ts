import { IngredientStatus } from '@genfeedai/contracts';
import type { IngredientsService } from '@services/content/ingredients.service';
import { useEffect, useMemo, useRef } from 'react';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';

const MAX_POLL_ATTEMPTS = 40;

/** Seconds-scale backoff: a watermarked preview takes a worker, not a request. */
function pollDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
}

/** A failed delivery attempt may still recover through the worker's retries. */
export function isStudioPreviewPending(job: StudioPlaygroundJob): boolean {
  const grant = job.ingredient?.mediaDelivery;
  // Legacy video models may supply a placeholder URL while delivery is pending.
  // Only the authorized grant proves that the protected preview is ready.
  return (
    !job.ingredient?.isDeleted &&
    grant?.id === (job.ingredientId ?? job.id) &&
    grant?.purpose === 'preview' &&
    job.status !== IngredientStatus.FAILED &&
    job.status !== IngredientStatus.PROCESSING &&
    job.status !== IngredientStatus.DRAFT &&
    (grant.state === 'PENDING' || grant.state === 'FAILED')
  );
}

interface UseStudioPendingPreviewsParams {
  getIngredientsService: () => Promise<IngredientsService>;
  jobs: readonly StudioPlaygroundJob[];
  recoverPreview: (job: StudioPlaygroundJob, recoveredUrl: string) => void;
}

/**
 * Observes bounded backend recovery and hands ready authorized URLs to cards.
 * The batch service may prepare pending variants; failed ones are read only.
 * Unsupported variants stop immediately, without retrying their render.
 */
export function useStudioPendingPreviews({
  getIngredientsService,
  jobs,
  recoverPreview,
}: UseStudioPendingPreviewsParams): void {
  const pendingJobs = useMemo(
    () => jobs.filter(isStudioPreviewPending),
    [jobs],
  );
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
          if (
            !grant ||
            grant.id !== (job.ingredientId ?? job.id) ||
            grant.purpose !== 'preview'
          )
            return;
          if (grant.state === 'READY' && grant.url) {
            settledIds.add(job.id);
            recoverPreview(job, grant.url);
          } else if (grant.state === 'UNSUPPORTED') {
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
