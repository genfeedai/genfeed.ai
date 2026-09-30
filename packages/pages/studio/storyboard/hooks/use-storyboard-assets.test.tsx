import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardAssets } from './use-storyboard-assets';

const { findOne, getService } = vi.hoisted(() => {
  const findOne = vi.fn();
  return { findOne, getService: vi.fn(async () => ({ findOne })) };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

describe('scoped storyboard asset reads', () => {
  beforeEach(() => vi.clearAllMocks());
  it('deduplicates reads and excludes denied, deleted and cross-brand assets', async () => {
    findOne.mockImplementation(async (id: string) => {
      if (id === 'denied') throw new Error('Forbidden');
      return {
        id,
        brandId: id === 'other' ? 'other-brand' : 'brand',
        isDeleted: id === 'deleted',
        cdnUrl: 'https://cdn.test/image.png',
      };
    });
    const { result } = renderHook(() =>
      useStoryboardAssets(
        'run:1',
        'brand',
        ['good', 'good', 'denied', 'deleted', 'other'].map((id) => ({
          id,
          kind: 'image',
        })),
      ),
    );
    await waitFor(() => expect(result.current['image:good']).toBeDefined());
    expect(findOne).toHaveBeenCalledTimes(4);
    expect(Object.keys(result.current)).toEqual(['image:good']);
    expect(findOne).toHaveBeenCalledWith(
      'good',
      { brandId: 'brand', isDeleted: false },
      expect.any(AbortSignal),
    );
  });
  it('clears scoped data and ignores a late response after revision changes', async () => {
    let finish: ((value: object) => void) | undefined;
    findOne.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ scope, ids }) =>
        useStoryboardAssets(
          scope,
          'brand',
          ids.map((id: string) => ({ id, kind: 'image' })),
        ),
      {
        initialProps: { scope: 'run:1', ids: ['old'] },
      },
    );
    await waitFor(() => expect(findOne).toHaveBeenCalledOnce());
    const signal = findOne.mock.calls[0][2] as AbortSignal;
    rerender({ scope: 'run:2', ids: [] });
    expect(signal.aborted).toBe(true);
    await act(async () =>
      finish?.({
        id: 'old',
        brandId: 'brand',
        cdnUrl: 'https://cdn.test/old.png',
      }),
    );
    expect(result.current).toEqual({});
  });
});
