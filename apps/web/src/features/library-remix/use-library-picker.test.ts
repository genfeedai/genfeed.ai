import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
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

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
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
    // One service per media type: the picker asks for the active one.
    mocks.getService.mockResolvedValue((category: string) => ({
      category,
      findAllPage: (...args: unknown[]) => mocks.findAll(category, ...args),
      findOne: mocks.findOne,
    }));
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

    const { result } = renderHook(
      () => useLibraryPicker({ onSelect: vi.fn() }),
      { wrapper: queryClientWrapper() },
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
      'images',
      expect.objectContaining({ limit: 24, page: 2 }),
      expect.any(AbortSignal),
    );
  });

  it('surfaces permission failures without leaking records', async () => {
    mocks.findAll.mockRejectedValue({ status: 403 });

    const { result } = renderHook(
      () => useLibraryPicker({ onSelect: vi.fn() }),
      { wrapper: queryClientWrapper() },
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

    const { result } = renderHook(() => useLibraryPicker({ onSelect }), {
      wrapper: queryClientWrapper(),
    });
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

    const { result } = renderHook(() => useLibraryPicker({ onSelect }), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => result.current.select(source));

    expect(result.current.selectionFailure).toBe('unauthorized');
    expect(onSelect).not.toHaveBeenCalled();

    mocks.findOne.mockRejectedValueOnce({ status: 404 });
    await act(async () => result.current.select(source));
    expect(result.current.selectionFailure).toBe('stale');
  });

  it('paints the cached sources on a return visit without a loading state', async () => {
    mocks.findAll.mockResolvedValueOnce(
      paginatedResponse([ingredient('image-1')], {
        totalDocs: 1,
        totalPages: 1,
      }),
    );
    const client = createTestQueryClient();
    const first = renderHook(() => useLibraryPicker({ onSelect: vi.fn() }), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.state.status).toBe('ready'),
    );
    first.unmount();

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useLibraryPicker({ onSelect: vi.fn() }),
      { wrapper: queryClientWrapper(client) },
    );

    expect(result.current.state.status).toBe('ready');
    expect(result.current.state.items.map((item) => item.id)).toEqual([
      'image-1',
    ]);
  });

  it('reads the chosen media type instead of showing the previous one', async () => {
    mocks.findAll.mockResolvedValueOnce(
      paginatedResponse([ingredient('image-1')], {
        totalDocs: 1,
        totalPages: 1,
      }),
    );
    const { result } = renderHook(
      () => useLibraryPicker({ onSelect: vi.fn() }),
      { wrapper: queryClientWrapper() },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    mocks.findAll.mockReturnValue(new Promise(() => {}));
    act(() => result.current.setCategory('videos'));

    expect(result.current.state.status).toBe('loading');
    expect(result.current.state.items).toEqual([]);
    await waitFor(() =>
      expect(mocks.findAll).toHaveBeenLastCalledWith(
        'videos',
        expect.objectContaining({ page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('keeps the sources on screen when a background refresh fails', async () => {
    mocks.findAll
      .mockResolvedValueOnce(
        paginatedResponse([ingredient('image-1')], {
          totalDocs: 1,
          totalPages: 1,
        }),
      )
      .mockRejectedValueOnce(new Error('offline'));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useLibraryPicker({ onSelect: vi.fn() }),
      { wrapper: queryClientWrapper(client) },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(() => client.refetchQueries({ queryKey: ['library-picker'] }));

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state.items.map((item) => item.id)).toEqual([
      'image-1',
    ]);
  });
});
