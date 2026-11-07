import { IngredientStatus, ViewType } from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStudioResultsFilters } from '@/features/studio/playground/hooks/useStudioResultsFilters';
import type { StudioPlaygroundJob } from '@/features/studio/playground/types';

const sunset: StudioPlaygroundJob = {
  createdAt: 3,
  id: 'job-sunset',
  prompt: 'Sunset over the harbour',
  status: IngredientStatus.GENERATED,
  type: 'image',
};
const clip: StudioPlaygroundJob = {
  createdAt: 2,
  id: 'job-clip',
  prompt: 'Harbour drone clip',
  status: IngredientStatus.GENERATED,
  type: 'video',
};
const portrait: StudioPlaygroundJob = {
  createdAt: 1,
  id: 'job-portrait',
  prompt: 'Studio portrait',
  status: IngredientStatus.GENERATED,
  type: 'image',
};
const jobs = [sunset, clip, portrait];

describe('useStudioResultsFilters', () => {
  it('shows every job newest first in a grid by default', () => {
    const { result } = renderHook(() => useStudioResultsFilters(jobs));

    expect(result.current.visibleJobs).toEqual([sunset, clip, portrait]);
    expect(result.current.resultType).toBe('all');
    expect(result.current.resultSort).toBe('newest');
    expect(result.current.resultsView).toBe(ViewType.GRID);
  });

  it('narrows by search text and type together', () => {
    const { result } = renderHook(() => useStudioResultsFilters(jobs));

    act(() => result.current.setSearch('harbour'));
    expect(result.current.visibleJobs).toEqual([sunset, clip]);

    act(() => result.current.setResultType('video'));
    expect(result.current.visibleJobs).toEqual([clip]);
  });

  it('reverses the filtered jobs when sorted oldest first', () => {
    const { result } = renderHook(() => useStudioResultsFilters(jobs));

    act(() => {
      result.current.setResultType('image');
      result.current.setResultSort('oldest');
    });

    expect(result.current.visibleJobs).toEqual([portrait, sunset]);
  });

  it('clears the type and sort but keeps the search text', () => {
    const { result } = renderHook(() => useStudioResultsFilters(jobs));

    act(() => {
      result.current.setSearch('harbour');
      result.current.setResultType('video');
      result.current.setResultSort('oldest');
    });
    act(() => result.current.clearFilters());

    expect(result.current.search).toBe('harbour');
    expect(result.current.resultType).toBe('all');
    expect(result.current.resultSort).toBe('newest');
    expect(result.current.visibleJobs).toEqual([sunset, clip]);
  });

  it('follows the gallery when new jobs arrive', () => {
    const { rerender, result } = renderHook(
      ({ gallery }) => useStudioResultsFilters(gallery),
      { initialProps: { gallery: [clip] } },
    );
    act(() => result.current.setResultType('image'));
    expect(result.current.visibleJobs).toEqual([]);

    rerender({ gallery: [sunset, clip] });

    expect(result.current.visibleJobs).toEqual([sunset]);
  });
});
