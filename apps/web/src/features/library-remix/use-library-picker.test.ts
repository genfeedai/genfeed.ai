import { paginatedResponse } from '@app-tests/paginated-response';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryPicker } from './use-library-picker';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findOne: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

function ingredient(
  id: string,
  overrides: Partial<IIngredient> = {},
): IIngredient {
  return {
    brand: 'brand-1',
    category: IngredientCategory.IMAGE,
    id,
    ingredientUrl: `https://cdn.example/${id}.jpg`,
    organization: 'org-1',
    ...overrides,
  } as IIngredient;
}

describe('useLibraryPicker', () => {
  beforeEach(() => {
    mocks.findAll.mockReset();
    mocks.findOne.mockReset();
    mocks.getService.mockReset();
    mocks.getService.mockResolvedValue({
      findAllPage: mocks.findAll,
      findOne: mocks.findOne,
    });
  });

  it('paginates a large media library without loading every record', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) =>
      ingredient(`image-${index + 1}`),
    );
    mocks.findAll
      .mockResolvedValueOnce(
        paginatedResponse(firstPage, { totalDocs: 25, totalPages: 2 }),
      )
      .mockResolvedValueOnce(
        paginatedResponse([ingredient('image-25')], {
          totalDocs: 25,
          totalPages: 2,
        }),
      );

    const { result } = renderHook(() =>
      useLibraryPicker({ onSelect: vi.fn() }),
    );

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state.items).toHaveLength(24);
    expect(result.current.state.hasMore).toBe(true);
    expect(result.current.state.total).toBe(25);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.state.items).toHaveLength(25));
    expect(result.current.state.hasMore).toBe(false);
    expect(result.current.state.total).toBe(25);
    expect(mocks.findAll).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 24, page: 2 }),
      undefined,
    );
  });

  it('surfaces permission failures without leaking records', async () => {
    mocks.findAll.mockRejectedValue({ status: 403 });

    const { result } = renderHook(() =>
      useLibraryPicker({ onSelect: vi.fn() }),
    );

    await waitFor(() =>
      expect(result.current.state.status).toBe('permission-denied'),
    );
    expect(result.current.state.items).toEqual([]);
  });

  it('re-fetches before returning a canonical typed reference', async () => {
    const source = ingredient('image-1', { version: 7 });
    const onSelect = vi.fn();
    mocks.findAll.mockResolvedValue(
      paginatedResponse([source], { totalDocs: 1, totalPages: 1 }),
    );
    mocks.findOne.mockResolvedValue(source);

    const { result } = renderHook(() => useLibraryPicker({ onSelect }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => result.current.select(source));

    expect(mocks.findOne).toHaveBeenCalledWith('image-1');
    expect(onSelect).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        kind: 'ingredient',
        organizationId: 'org-1',
        recordId: 'image-1',
        recordVersion: '7',
        serializer: 'ingredient',
      },
      source,
    );
  });

  it('fails closed when a selected source becomes stale or changes brand', async () => {
    const source = ingredient('image-1');
    const onSelect = vi.fn();
    mocks.findAll.mockResolvedValue(
      paginatedResponse([source], { totalDocs: 1, totalPages: 1 }),
    );
    mocks.findOne.mockResolvedValue(
      ingredient('image-1', { brand: 'brand-2' }),
    );

    const { result } = renderHook(() => useLibraryPicker({ onSelect }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => result.current.select(source));

    expect(result.current.selectionFailure).toBe('unauthorized');
    expect(onSelect).not.toHaveBeenCalled();

    mocks.findOne.mockRejectedValueOnce({ status: 404 });
    await act(async () => result.current.select(source));
    expect(result.current.selectionFailure).toBe('stale');
  });
});
