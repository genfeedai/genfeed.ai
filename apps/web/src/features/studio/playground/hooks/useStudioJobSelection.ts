'use client';

import { useEffect, useMemo, useState } from 'react';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { groupStudioPlaygroundJobsByRun } from '@/features/studio/playground/utils/studio-playground-recipe';

export interface UseStudioJobSelectionReturn {
  selectedJob: StudioPlaygroundJob | null;
  selectedJobId: string | null;
  /** The job the selected one was made from, when it is still visible. */
  selectedParentJob: StudioPlaygroundJob | undefined;
  /** Every visible job of the selected job's run, or just the selected job. */
  selectedRunJobs: StudioPlaygroundJob[];
  setSelectedJobId: (jobId: string | null) => void;
}

/**
 * Which Studio result the inspector shows. The selection only resolves among
 * the visible jobs, and it clears itself once its job is filtered out or
 * removed, so a later job with the same id is never selected by accident.
 */
export function useStudioJobSelection(
  visibleJobs: readonly StudioPlaygroundJob[],
): UseStudioJobSelectionReturn {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const selectedJob = useMemo(
    () => visibleJobs.find((job) => job.id === selectedJobId) ?? null,
    [selectedJobId, visibleJobs],
  );

  const selectedRunJobs = useMemo(() => {
    if (!selectedJob) {
      return [];
    }

    const runId = selectedJob.runId;
    if (!runId) {
      return [selectedJob];
    }

    return (
      groupStudioPlaygroundJobsByRun(visibleJobs).find(
        (run) => run.id === runId,
      )?.jobs ?? [selectedJob]
    );
  }, [selectedJob, visibleJobs]);

  const selectedParentJob = useMemo(() => {
    const parentId = selectedJob?.parentId;
    return parentId
      ? visibleJobs.find((job) => job.ingredientId === parentId)
      : undefined;
  }, [selectedJob, visibleJobs]);

  useEffect(() => {
    if (selectedJobId && !selectedJob) {
      setSelectedJobId(null);
    }
  }, [selectedJob, selectedJobId]);

  return {
    selectedJob,
    selectedJobId,
    selectedParentJob,
    selectedRunJobs,
    setSelectedJobId,
  };
}
