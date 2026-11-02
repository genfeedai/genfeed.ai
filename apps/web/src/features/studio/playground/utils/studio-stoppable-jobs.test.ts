import { IngredientStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';
import { selectStoppableStudioJobs } from './studio-stoppable-jobs';

function buildJob(
  overrides: Partial<StudioPlaygroundJob> = {},
): StudioPlaygroundJob {
  return {
    createdAt: 1,
    id: 'job',
    ingredientId: 'ingredient',
    prompt: 'A ceramic bird',
    status: IngredientStatus.PROCESSING,
    type: 'image',
    ...overrides,
  };
}

function ids(jobs: readonly StudioPlaygroundJob[]): string[] {
  return jobs.map((job) => job.id);
}

describe('selectStoppableStudioJobs', () => {
  it('returns nothing when no run is generating', () => {
    expect(
      selectStoppableStudioJobs([
        buildJob({ id: 'done', status: IngredientStatus.GENERATED }),
        buildJob({ id: 'failed', status: IngredientStatus.FAILED }),
      ]),
    ).toEqual([]);
  });

  it('skips a run that is still being sent', () => {
    expect(
      ids(
        selectStoppableStudioJobs([
          buildJob({
            id: 'submitting-run-0',
            ingredientId: undefined,
            phase: 'submitting',
          }),
        ]),
      ),
    ).toEqual([]);
  });

  it('skips a job that was already cancelled', () => {
    expect(
      ids(
        selectStoppableStudioJobs([
          buildJob({ id: 'cancelled', phase: 'cancelled' }),
        ]),
      ),
    ).toEqual([]);
  });

  it('picks every output of the newest running run', () => {
    expect(
      ids(
        selectStoppableStudioJobs([
          buildJob({ createdAt: 1, id: 'old', runId: 'run-1' }),
          buildJob({ createdAt: 5, id: 'new-a', runId: 'run-2' }),
          buildJob({ createdAt: 4, id: 'new-b', runId: 'run-2' }),
        ]),
      ),
    ).toEqual(['new-a', 'new-b']);
  });

  it('picks only the newest job when it has no run id', () => {
    expect(
      ids(
        selectStoppableStudioJobs([
          buildJob({ createdAt: 1, id: 'old' }),
          buildJob({ createdAt: 2, id: 'new' }),
        ]),
      ),
    ).toEqual(['new']);
  });
});
