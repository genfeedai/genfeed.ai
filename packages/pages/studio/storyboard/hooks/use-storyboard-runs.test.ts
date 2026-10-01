import type { BrandRemixRunSummary } from '@genfeedai/contracts/api-types/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandId: { value: 'brand-1' },
  listBrandRemixRuns: vi.fn(),
  listStoryboardRuns: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId.value,
}));

// A stable resolver, like the real `useCallback`-backed hook.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => {
  const service = {
    listBrandRemixRuns: mocks.listBrandRemixRuns,
    listStoryboardRuns: mocks.listStoryboardRuns,
  };
  const resolveService = async () => service;
  return { useAuthedService: () => resolveService };
});

import {
  STORYBOARD_RUNS_PAGE_SIZE,
  useStoryboardRuns,
} from './use-storyboard-runs';

function summary(id: string): BrandRemixRunSummary {
  return {
    brandId: 'brand-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    id,
    outputKind: 'video',
    phase: 'prefilled',
    runtimeSeconds: 10,
    shotCount: 2,
    sourceKind: 'remix_discovery',
    title: `Run ${id}`,
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

const fullPage = Array.from({ length: STORYBOARD_RUNS_PAGE_SIZE }, (_, index) =>
  summary(`run-${index + 1}`),
);

describe('useStoryboardRuns', () => {
  beforeEach(() => {
    mocks.listStoryboardRuns.mockResolvedValue([]);
    vi.clearAllMocks();
    mocks.brandId.value = 'brand-1';
  });

  it('loads the first page of the brand runs with an abortable request', async () => {
    mocks.listBrandRemixRuns.mockResolvedValue([summary('run-1')]);

    const { result } = renderHook(() => useStoryboardRuns());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.runs.map((run) => run.id)).toEqual(['run-1']);
    expect(result.current.hasMore).toBe(false);
    expect(mocks.listBrandRemixRuns).toHaveBeenCalledTimes(1);
    expect(mocks.listBrandRemixRuns).toHaveBeenCalledWith(
      'brand-1',
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 1 },
      expect.any(AbortSignal),
    );
  });

  it('appends the next page without duplicating rows', async () => {
    mocks.listBrandRemixRuns
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([summary('run-50'), summary('run-51')]);
    const { result } = renderHook(() => useStoryboardRuns());
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());

    await waitFor(() =>
      expect(result.current.runs).toHaveLength(STORYBOARD_RUNS_PAGE_SIZE + 1),
    );
    expect(mocks.listBrandRemixRuns).toHaveBeenLastCalledWith(
      'brand-1',
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 2 },
      expect.any(AbortSignal),
    );
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps loaded rows and retries the same page after a failure', async () => {
    mocks.listBrandRemixRuns
      .mockResolvedValueOnce(fullPage)
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([summary('run-51')]);
    const { result } = renderHook(() => useStoryboardRuns());
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe('Network down'));
    expect(result.current.runs).toHaveLength(STORYBOARD_RUNS_PAGE_SIZE);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mocks.listBrandRemixRuns.mock.calls.map((call) => call[1])).toEqual([
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 1 },
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 2 },
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 2 },
    ]);
    expect(result.current.runs.some((run) => run.id === 'run-51')).toBe(true);
  });

  it('starts over when the brand changes', async () => {
    mocks.listBrandRemixRuns
      .mockResolvedValueOnce([summary('run-1')])
      .mockResolvedValueOnce([{ ...summary('run-b'), brandId: 'brand-2' }]);
    const { result, rerender } = renderHook(() => useStoryboardRuns());
    await waitFor(() => expect(result.current.runs).toHaveLength(1));

    mocks.brandId.value = 'brand-2';
    rerender();

    await waitFor(() =>
      expect(result.current.runs.map((run) => run.id)).toEqual(['run-b']),
    );
    expect(mocks.listBrandRemixRuns).toHaveBeenLastCalledWith(
      'brand-2',
      { limit: STORYBOARD_RUNS_PAGE_SIZE, page: 1 },
      expect.any(AbortSignal),
    );
  });
});
