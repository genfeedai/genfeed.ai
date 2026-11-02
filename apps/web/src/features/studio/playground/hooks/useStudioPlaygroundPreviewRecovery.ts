import { useMemo } from 'react';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { useStudioPlaygroundPreviewRecoveryStore } from '@/store/studio-playground-preview-recovery.store';

/**
 * Carries a successful Inspector "Retry preview" back to the gallery. The
 * Inspector owns the retry; without this the grid card for the same asset
 * keeps its local "Preview unavailable" state and its failed delivery grant.
 * The recovery is shared across workspaces because an open generation and the
 * gallery are separate routes. Recovery only re-reads authorized media — it
 * never starts a generation.
 */
export function useStudioPlaygroundPreviewRecovery(
  jobs: readonly StudioPlaygroundJob[],
) {
  const recoveries = useStudioPlaygroundPreviewRecoveryStore(
    (state) => state.recoveries,
  );
  const recoverPreview = useStudioPlaygroundPreviewRecoveryStore(
    (state) => state.recordRecovery,
  );

  const recoveredJobs = useMemo(
    () =>
      jobs.map((job) => {
        const recovery = recoveries[job.id];
        // A later gallery read that already replaced the failed URL wins.
        return recovery?.url && recovery.staleUrl === job.url
          ? { ...job, url: recovery.url }
          : job;
      }),
    [jobs, recoveries],
  );

  const previewRevisions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(recoveries).map(([jobId, recovery]) => [
          jobId,
          recovery.revision,
        ]),
      ),
    [recoveries],
  );

  return { previewRevisions, recoverPreview, recoveredJobs };
}
