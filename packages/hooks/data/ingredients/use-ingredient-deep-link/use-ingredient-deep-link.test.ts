import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useIngredientDeepLink } from '@hooks/data/ingredients/use-ingredient-deep-link/use-ingredient-deep-link';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replaceMock = vi.fn();
const findByIdsMock = vi.fn();
const getIngredientsServiceMock = vi.fn();

let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/brand/library/images',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock(
  '@hooks/data/ingredients/use-ingredient-services/use-ingredient-services',
  () => ({
    useIngredientServices: () => ({
      getIngredientsService: getIngredientsServiceMock,
    }),
  }),
);

function buildIngredient(id: string): IIngredient {
  return { id } as IIngredient;
}

describe('useIngredientDeepLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    getIngredientsServiceMock.mockResolvedValue({
      findByIds: findByIdsMock,
    });
  });

  it('does nothing without an asset param', () => {
    const onOpen = vi.fn();

    const { result } = renderHook(() =>
      useIngredientDeepLink({
        ingredients: [buildIngredient('ing-1')],
        isLoading: false,
        onOpen,
      }),
    );

    expect(result.current.assetId).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('opens an ingredient already loaded on the page and strips the param', async () => {
    currentSearchParams = new URLSearchParams('asset=ing-2');
    const onOpen = vi.fn();
    const ingredient = buildIngredient('ing-2');

    renderHook(() =>
      useIngredientDeepLink({
        ingredients: [buildIngredient('ing-1'), ingredient],
        isLoading: false,
        onOpen,
      }),
    );

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(ingredient));
    expect(findByIdsMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith(
      '/acme/brand/library/images',
      expect.objectContaining({ scroll: false }),
    );
  });

  it('preserves other query params when clearing the asset link', async () => {
    currentSearchParams = new URLSearchParams('folder=hero&asset=ing-3');
    const ingredient = buildIngredient('ing-3');
    const onOpen = vi.fn();

    renderHook(() =>
      useIngredientDeepLink({
        ingredients: [ingredient],
        isLoading: false,
        onOpen,
      }),
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(replaceMock).toHaveBeenCalledWith(
      '/acme/brand/library/images?folder=hero',
      expect.objectContaining({ scroll: false }),
    );
  });

  it('fetches an ingredient that is not on the current page of results', async () => {
    currentSearchParams = new URLSearchParams('asset=ing-remote');
    const remote = buildIngredient('ing-remote');
    findByIdsMock.mockResolvedValue([remote]);
    const onOpen = vi.fn();

    renderHook(() =>
      useIngredientDeepLink({
        ingredients: [buildIngredient('ing-1')],
        isLoading: false,
        onOpen,
      }),
    );

    await waitFor(() =>
      expect(findByIdsMock).toHaveBeenCalledWith(['ing-remote']),
    );
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(remote));
  });

  it('defers the remote lookup until the list has loaded', async () => {
    currentSearchParams = new URLSearchParams('asset=ing-remote');
    const onOpen = vi.fn();

    const { rerender } = renderHook(
      ({ isLoading }: { isLoading: boolean }) =>
        useIngredientDeepLink({ ingredients: [], isLoading, onOpen }),
      { initialProps: { isLoading: true } },
    );

    expect(findByIdsMock).not.toHaveBeenCalled();

    findByIdsMock.mockResolvedValue([buildIngredient('ing-remote')]);
    rerender({ isLoading: false });

    await waitFor(() => expect(findByIdsMock).toHaveBeenCalledTimes(1));
  });

  it('opens a given asset only once across re-renders', async () => {
    currentSearchParams = new URLSearchParams('asset=ing-2');
    const ingredient = buildIngredient('ing-2');
    const onOpen = vi.fn();

    const { rerender } = renderHook(() =>
      useIngredientDeepLink({
        ingredients: [ingredient],
        isLoading: false,
        onOpen,
      }),
    );

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));

    rerender();
    rerender();

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('clears the param even when the lookup fails', async () => {
    currentSearchParams = new URLSearchParams('asset=ing-missing');
    findByIdsMock.mockRejectedValue(new Error('boom'));
    const onOpen = vi.fn();

    renderHook(() =>
      useIngredientDeepLink({
        ingredients: [],
        isLoading: false,
        onOpen,
      }),
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalled());
    expect(onOpen).not.toHaveBeenCalled();
  });
});
