import type { StudioPlaygroundPreviewRecovery } from '@genfeedai/props/studio/studio-playground.props';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import { useCallback, useMemo, useState } from 'react';

/**
 * Carries a successful Inspector "Retry preview" back to the gallery. The
 * Inspector owns the retry; without this the grid card for the same asset
 * keeps its local "Preview unavailable" state and its failed delivery grant.
 * Recovery only re-reads authorized media — it never starts a generation.
 */
export function useStudioPlaygroundPreviewRecovery(
  jobs: readonly StudioPlaygroundJob[],
) {
  const [recoveries, setRecoveries] = useState<
    Readonly<Record<string, StudioPlaygroundPreviewRecovery>>
  >({});

  const recoverPreview = useCallback(
    (job: StudioPlaygroundJob, recoveredUrl: string | undefined) => {
      setRecoveries((current) => ({
        ...current,
        [job.id]: {
          revision: (current[job.id]?.revision ?? 0) + 1,
          ...(recoveredUrl && recoveredUrl !== job.url
            ? { staleUrl: job.url, url: recoveredUrl }
            : {}),
        },
      }));
    },
    [],
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
