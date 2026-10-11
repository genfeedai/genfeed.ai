import { IngredientStatus } from '@genfeedai/contracts';
import { useStudioPlaygroundPreviewRecovery } from '@pages/studio/playground/hooks/useStudioPlaygroundPreviewRecovery';
import type { StudioPlaygroundJob } from '@pages/studio/playground/types';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const job: StudioPlaygroundJob = {
  createdAt: 1,
  id: 'job-1',
  ingredientId: 'ing-1',
  prompt: 'Saved image',
  status: IngredientStatus.GENERATED,
  type: 'image',
  url: 'https://cdn.example/expired.png',
};
const sibling: StudioPlaygroundJob = {
  ...job,
  id: 'job-2',
  ingredientId: 'ing-2',
  url: 'https://cdn.example/other.png',
};

describe('useStudioPlaygroundPreviewRecovery', () => {
  it('bumps only the recovered asset and swaps in the freshly read URL', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundPreviewRecovery([job, sibling]),
    );
    expect(result.current.previewRevisions).toEqual({});
    expect(result.current.recoveredJobs).toEqual([job, sibling]);

    act(() =>
      result.current.recoverPreview(job, 'https://cdn.example/fresh.png'),
    );

    expect(result.current.previewRevisions).toEqual({ 'job-1': 1 });
    expect(result.current.recoveredJobs).toEqual([
      { ...job, url: 'https://cdn.example/fresh.png' },
      sibling,
    ]);

    act(() => result.current.recoverPreview(job, undefined));
    expect(result.current.previewRevisions).toEqual({ 'job-1': 2 });
    // A grant-delivered retry carries no stored URL; the revision alone
    // reauthorizes the tile and the gallery URL stays as it is.
    expect(result.current.recoveredJobs[0]).toBe(job);
  });

  it('lets a later gallery read replace the recovered URL', () => {
    const { rerender, result } = renderHook(
      ({ jobs }) => useStudioPlaygroundPreviewRecovery(jobs),
      { initialProps: { jobs: [job] } },
    );
    act(() =>
      result.current.recoverPreview(job, 'https://cdn.example/fresh.png'),
    );
    const reloaded = { ...job, url: 'https://cdn.example/reloaded.png' };

    rerender({ jobs: [reloaded] });

    expect(result.current.recoveredJobs).toEqual([reloaded]);
    expect(result.current.previewRevisions).toEqual({ 'job-1': 1 });
  });
});
