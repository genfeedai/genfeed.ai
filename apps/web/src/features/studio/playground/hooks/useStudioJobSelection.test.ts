import { IngredientStatus } from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStudioJobSelection } from '@/features/studio/playground/hooks/useStudioJobSelection';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';

const original: StudioPlaygroundJob = {
  createdAt: 1,
  id: 'job-original',
  ingredientId: 'ing-original',
  prompt: 'Original still',
  status: IngredientStatus.GENERATED,
  type: 'image',
};
const variantA: StudioPlaygroundJob = {
  createdAt: 2,
  id: 'job-variant-a',
  ingredientId: 'ing-variant-a',
  parentId: 'ing-original',
  prompt: 'Variant',
  runId: 'run-1',
  status: IngredientStatus.GENERATED,
  type: 'image',
};
const variantB: StudioPlaygroundJob = {
  ...variantA,
  id: 'job-variant-b',
  ingredientId: 'ing-variant-b',
};
const otherRun: StudioPlaygroundJob = {
  ...variantA,
  id: 'job-other-run',
  ingredientId: 'ing-other-run',
  parentId: undefined,
  runId: 'run-2',
};

describe('useStudioJobSelection', () => {
  it('selects nothing until a job is chosen', () => {
    const { result } = renderHook(() =>
      useStudioJobSelection([original, variantA]),
    );

    expect(result.current.selectedJob).toBeNull();
    expect(result.current.selectedRunJobs).toEqual([]);
    expect(result.current.selectedParentJob).toBeUndefined();
  });

  it('resolves the run siblings and the visible parent of the selection', () => {
    const { result } = renderHook(() =>
      useStudioJobSelection([original, variantA, variantB, otherRun]),
    );

    act(() => result.current.setSelectedJobId('job-variant-b'));

    expect(result.current.selectedJob).toBe(variantB);
    expect(result.current.selectedRunJobs).toEqual([variantA, variantB]);
    expect(result.current.selectedParentJob).toBe(original);
  });

  it('treats a job without a run as a run of one', () => {
    const { result } = renderHook(() =>
      useStudioJobSelection([original, variantA]),
    );

    act(() => result.current.setSelectedJobId('job-original'));

    expect(result.current.selectedRunJobs).toEqual([original]);
    expect(result.current.selectedParentJob).toBeUndefined();
  });

  it('clears a selection whose job is no longer visible', () => {
    const { rerender, result } = renderHook(
      ({ jobs }) => useStudioJobSelection(jobs),
      { initialProps: { jobs: [original, variantA] } },
    );
    act(() => result.current.setSelectedJobId('job-variant-a'));

    rerender({ jobs: [original] });
    expect(result.current.selectedJobId).toBeNull();

    // The same id coming back later does not revive the old selection.
    rerender({ jobs: [original, variantA] });
    expect(result.current.selectedJob).toBeNull();
  });
});
