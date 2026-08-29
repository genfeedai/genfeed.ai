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

type ServiceKey = 'avatars' | 'gifs' | 'images' | 'videos';
type PageResponder = (page: number) => IIngredient[] | Promise<IIngredient[]>;

/** Per-service page responses, swapped per test to drive the paging loop. */
const responders: Record<ServiceKey, PageResponder> = {
  avatars: () => [],
  gifs: () => [],
  images: () => [],
  videos: () => [],
};

const findAllSpies: Record<ServiceKey, ReturnType<typeof vi.fn>> = {
  avatars: vi.fn(),
  gifs: vi.fn(),
  images: vi.fn(),
  videos: vi.fn(),
};

function makeService(key: ServiceKey) {
  const findAll = vi.fn((query: Record<string, unknown>) =>
    Promise.resolve(responders[key](Number(query.page ?? 1))),
  );
  findAllSpies[key] = findAll;
  return { findAll };
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
  ImagesService: { getInstance: () => makeService('images') },
}));
vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => makeService('videos') },
}));
vi.mock('@genfeedai/services/ingredients/gifs.service', () => ({
  GIFsService: { getInstance: () => makeService('gifs') },
}));
vi.mock('@genfeedai/services/ingredients/avatars.service', () => ({
  AvatarsService: { getInstance: () => makeService('avatars') },
}));

function fullPage(prefix: string, page: number): IIngredient[] {
  return Array.from(
    { length: 100 },
    (_unused, index) =>
      ({
        id: `${prefix}-${page}-${index}`,
        category: IngredientCategory.IMAGE,
        ingredientUrl: `https://cdn/${prefix}-${page}-${index}.png`,
      }) as IIngredient,
  );
}

describe('useBrandMediaAssets', () => {
  beforeEach(() => {
    brandState.brandId = 'brand-1';
    responders.images = () => [imageItem, urllessImage];
    responders.videos = () => [videoItem];
    responders.gifs = () => [gifItem];
    responders.avatars = () => [];
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

  it('paints the assets it has while a slower service is still paging', async () => {
    let releaseAvatars: (items: IIngredient[]) => void = () => undefined;
    responders.avatars = () =>
      new Promise<IIngredient[]>((resolve) => {
        releaseAvatars = resolve;
      });

    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() =>
      expect(result.current.assets.length).toBeGreaterThan(0),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isLoadingMore).toBe(true);

    releaseAvatars([]);

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
  });

  it('keeps loading while siblings page on after one service fails', async () => {
    responders.images = () => Promise.reject(new Error('images down'));
    let releaseAvatars: (items: IIngredient[]) => void = () => undefined;
    responders.avatars = () =>
      new Promise<IIngredient[]>((resolve) => {
        releaseAvatars = resolve;
      });

    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() =>
      expect(result.current.assets.length).toBeGreaterThan(0),
    );

    // The rejection must not settle the load while avatars are still in flight.
    expect(result.current.isLoadingMore).toBe(true);

    releaseAvatars([]);

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    // Something did arrive, so a partial load is not an error.
    expect(result.current.error).toBeNull();
  });

  it('surfaces the failure when every service fails', async () => {
    const failure = () => Promise.reject(new Error('assets down'));
    responders.images = failure;
    responders.videos = failure;
    responders.gifs = failure;
    responders.avatars = failure;

    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('stops paging once the shared asset budget is spent', async () => {
    responders.images = (page) => fullPage('img', page);

    const { result } = renderHook(() => useBrandMediaAssets());

    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    expect(result.current.assets).toHaveLength(1000);
    expect(result.current.isTruncated).toBe(true);
    // 10 full pages fills the budget; the eleventh call is what detects it.
    expect(findAllSpies.images.mock.calls.length).toBeLessThanOrEqual(11);
  });
});
