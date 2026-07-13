import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryPicker } from './use-library-picker';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  findOne: vi.fn(),
  getService: vi.fn(),
  total: 0,
  totalPages: 1,
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

vi.mock('@genfeedai/services/content/pages.service', () => ({
  PagesService: {
    getTotalDocs: () => mocks.total,
    getTotalPages: () => mocks.totalPages,
  },
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
      findAll: mocks.findAll,
      findOne: mocks.findOne,
    });
    mocks.total = 1;
    mocks.totalPages = 1;
  });

  it('paginates a large media library without loading every record', async () => {
    const firstPage = Array.from({ length: 24 }, (_, index) =>
      ingredient(`image-${index + 1}`),
    );
    mocks.total = 25;
    mocks.totalPages = 2;
    mocks.findAll
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([ingredient('image-25')]);

    const { result } = renderHook(() =>
      useLibraryPicker({ onSelect: vi.fn() }),
    );

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state.items).toHaveLength(24);
    expect(result.current.state.hasMore).toBe(true);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.state.items).toHaveLength(25));
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
    const source = ingredient('image-1');
    const onSelect = vi.fn();
    mocks.findAll.mockResolvedValue([source]);
    mocks.findOne.mockResolvedValue(source);

    const { result } = renderHook(() => useLibraryPicker({ onSelect }));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => result.current.select(source));

    expect(mocks.findOne).toHaveBeenCalledWith('image-1');
    expect(onSelect).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: 'ingredient',
      organizationId: 'org-1',
      recordId: 'image-1',
      serializer: 'ingredient',
    });
  });

  it('fails closed when a selected source becomes stale or changes brand', async () => {
    const source = ingredient('image-1');
    const onSelect = vi.fn();
    mocks.findAll.mockResolvedValue([source]);
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
