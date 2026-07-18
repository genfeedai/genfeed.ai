import { AssetParent, IngredientCategory } from '@genfeedai/enums';
import type { IAsset, IIngredient } from '@genfeedai/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryRemixSource } from './use-library-remix-source';

const mocks = vi.hoisted(() => ({
  findAsset: vi.fn(),
  findIngredients: vi.fn(),
  getService: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@genfeedai/services/content/assets.service', () => ({
  AssetsService: {
    getInstance: () => ({ findOne: mocks.findAsset }),
  },
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: () => ({ findByIds: mocks.findIngredients }),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

describe('useLibraryRemixSource', () => {
  beforeEach(() => {
    mocks.findAsset.mockReset();
    mocks.findIngredients.mockReset();
    mocks.getService.mockReset();
    mocks.getService.mockResolvedValue({
      findByIds: mocks.findIngredients,
      findOne: mocks.findAsset,
    });
  });

  it('resolves an ingredient from intent under effective server-backed scope', async () => {
    mocks.findIngredients.mockResolvedValue([
      {
        brand: 'brand-1',
        category: IngredientCategory.IMAGE,
        id: 'ingredient-1',
        ingredientUrl: 'https://cdn.example/ingredient-1.jpg',
        organization: 'org-1',
        version: 7,
      } as IIngredient,
    ]);

    const { result } = renderHook(() =>
      useLibraryRemixSource('ingredient:ingredient-1', '7'),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.findIngredients).toHaveBeenCalledWith(['ingredient-1']);
    expect(result.current.reference).toEqual({
      brandId: 'brand-1',
      kind: 'ingredient',
      organizationId: 'org-1',
      recordId: 'ingredient-1',
      recordVersion: '7',
      serializer: 'ingredient',
    });
  });

  it('rejects a source whose canonical version changed after selection', async () => {
    mocks.findIngredients.mockResolvedValue([
      {
        brand: 'brand-1',
        category: IngredientCategory.IMAGE,
        id: 'ingredient-1',
        organization: 'org-1',
        version: 8,
      } as IIngredient,
    ]);

    const { result } = renderHook(() =>
      useLibraryRemixSource('ingredient:ingredient-1', '7'),
    );

    await waitFor(() => expect(result.current.status).toBe('stale'));
    expect(result.current.record).toBeNull();
  });

  it('rejects a canonical asset that is outside the effective brand', async () => {
    mocks.findAsset.mockResolvedValue({
      id: 'asset-1',
      isDeleted: false,
      parent: 'brand-2',
      parentModel: AssetParent.BRAND,
      url: 'https://cdn.example/asset-1.jpg',
    } as IAsset);

    const { result } = renderHook(() => useLibraryRemixSource('asset:asset-1'));

    await waitFor(() =>
      expect(result.current.status).toBe('permission-denied'),
    );
    expect(result.current.record).toBeNull();
  });

  it('reports deleted and missing media as stale', async () => {
    mocks.findAsset.mockRejectedValue({ status: 404 });

    const { result } = renderHook(() => useLibraryRemixSource('asset:asset-1'));

    await waitFor(() => expect(result.current.status).toBe('stale'));
    expect(result.current.record).toBeNull();
  });
});
