import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { isStudioPlaygroundJobPending } from '@/features/studio/playground/utils/studio-playground-recipe';

/**
 * What the composer's Stop button cancels: the outputs of the newest run that
 * is still generating. Only jobs the server already knows about can be
 * cancelled, so a run still being sent has nothing to stop yet — the send
 * button shows its loading state for that stretch instead.
 */
export function selectStoppableStudioJobs(
  jobs: readonly StudioPlaygroundJob[],
): StudioPlaygroundJob[] {
  const running = jobs.filter(
    (job) =>
      Boolean(job.ingredientId) &&
      job.phase !== 'cancelled' &&
      isStudioPlaygroundJobPending(job.status),
  );
  const newest = running.reduce<StudioPlaygroundJob | undefined>(
    (latest, job) =>
      !latest || job.createdAt > latest.createdAt ? job : latest,
    undefined,
  );
  if (!newest) return [];
  return newest.runId
    ? running.filter((job) => job.runId === newest.runId)
    : [newest];
}
