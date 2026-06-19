import { IngredientCategory } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useBrandMediaAssets } from '@hooks/data/moodboard/use-brand-media-assets/use-brand-media-assets';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const brandState = { brandId: 'brand-1' };

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

// useAuthedService(factory) -> getter() that resolves the factory with a token.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => () =>
    Promise.resolve(factory('test-token')),
}));

function makeService(items: IIngredient[]) {
  return { findAll: vi.fn().mockResolvedValue(items) };
}

const imageItem = {
  id: 'img-1',
  category: IngredientCategory.IMAGE,
  ingredientUrl: 'https://cdn/img-1.png',
} as IIngredient;
const videoItem = {
  id: 'vid-1',
  category: IngredientCategory.VIDEO,
  thumbnailUrl: 'https://cdn/vid-1.jpg',
} as IIngredient;
const gifItem = {
  id: 'gif-1',
  category: IngredientCategory.GIF,
  ingredientUrl: 'https://cdn/gif-1.gif',
} as IIngredient;
const urllessImage = {
  id: 'img-2',
  category: IngredientCategory.IMAGE,
} as IIngredient;

vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => makeService([imageItem, urllessImage]) },
}));
vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => makeService([videoItem]) },
}));
vi.mock('@genfeedai/services/ingredients/gifs.service', () => ({
  GIFsService: { getInstance: () => makeService([gifItem]) },
}));
vi.mock('@genfeedai/services/ingredients/avatars.service', () => ({
  AvatarsService: { getInstance: () => makeService([]) },
}));

describe('useBrandMediaAssets', () => {
  beforeEach(() => {
    brandState.brandId = 'brand-1';
    vi.clearAllMocks();
  });

  it('merges visual assets across all four types', async () => {
    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ids = result.current.assets.map((asset) => asset.id).sort();
    expect(ids).toEqual(['gif-1', 'img-1', 'vid-1']);
  });

  it('excludes assets without a displayable url', async () => {
    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assets.find((a) => a.id === 'img-2')).toBeUndefined();
  });

  it('returns empty and stops loading when no brand is selected', async () => {
    brandState.brandId = '';

    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.assets).toEqual([]);
  });
});
