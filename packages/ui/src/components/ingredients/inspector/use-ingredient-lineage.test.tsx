import { IngredientLineageDirection } from '@genfeedai/contracts';
import type { IIngredientLineagePage } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIngredientLineage } from './use-ingredient-lineage';

const findLineage = vi.hoisted(() => vi.fn());

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => {
  // Like the real hook, the getter keeps one identity across renders.
  const getService = () => Promise.resolve({ findLineage });
  return { useAuthedService: () => getService };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

function page(
  overrides: Partial<IIngredientLineagePage>,
): IIngredientLineagePage {
  return {
    hasNext: false,
    hiddenCount: 0,
    items: [],
    page: 1,
    pageSize: 24,
    total: 0,
    totalPages: 1,
    ...overrides,
  };
}

function item(id: string) {
  return { id } as IIngredientLineagePage['items'][number];
}

describe('useIngredientLineage', () => {
  beforeEach(() => {
    findLineage.mockReset();
  });

  it('loads the first page of 24 for the asset and direction', async () => {
    findLineage.mockResolvedValue(
      page({ hiddenCount: 2, items: [item('a')], total: 1 }),
    );

    const { result } = renderHook(() =>
      useIngredientLineage('asset-1', IngredientLineageDirection.MADE_FROM),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(findLineage).toHaveBeenCalledWith(
      'asset-1',
      IngredientLineageDirection.MADE_FROM,
      expect.objectContaining({ limit: 24, page: 1 }),
    );
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a']);
    expect(result.current.hiddenCount).toBe(2);
    expect(result.current.hasNext).toBe(false);
  });

  it('appends the next page on loadMore', async () => {
    findLineage
      .mockResolvedValueOnce(page({ hasNext: true, items: [item('a')] }))
      .mockResolvedValueOnce(page({ items: [item('b')], page: 2 }));

    const { result } = renderHook(() =>
      useIngredientLineage('asset-1', IngredientLineageDirection.USED_IN),
    );
    await waitFor(() => expect(result.current.hasNext).toBe(true));

    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.id)).toEqual(['a', 'b']),
    );

    expect(findLineage).toHaveBeenLastCalledWith(
      'asset-1',
      IngredientLineageDirection.USED_IN,
      expect.objectContaining({ page: 2 }),
    );
    expect(result.current.hasNext).toBe(false);
  });

  it('starts over for a different asset instead of showing the previous one', async () => {
    findLineage
      .mockResolvedValueOnce(page({ items: [item('a')] }))
      .mockResolvedValueOnce(page({ items: [item('z')] }));

    const { rerender, result } = renderHook(
      ({ id }) =>
        useIngredientLineage(id, IngredientLineageDirection.MADE_FROM),
      { initialProps: { id: 'asset-1' } },
    );
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ id: 'asset-2' });
    expect(result.current.items).toEqual([]);
    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.id)).toEqual(['z']),
    );
    expect(findLineage).toHaveBeenLastCalledWith(
      'asset-2',
      IngredientLineageDirection.MADE_FROM,
      expect.objectContaining({ page: 1 }),
    );
  });

  it('reports an error without throwing', async () => {
    findLineage.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() =>
      useIngredientLineage('asset-1', IngredientLineageDirection.MADE_FROM),
    );
    await waitFor(() => expect(result.current.hasError).toBe(true));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
  });
});
