import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type StoryboardAssetRequest,
  useStoryboardAssets,
} from './use-storyboard-assets';

const { findOne, previewGrant, resolvers } = vi.hoisted(() => ({
  findOne: vi.fn(),
  previewGrant: vi.fn(),
  resolvers: new Map<string, () => Promise<unknown>>(),
}));
// A stable resolver per factory, like the real hook's `useCallback`.
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = factory.toString();
    const existing = resolvers.get(key);
    if (existing) return existing;
    const resolver = async () => factory('token');
    resolvers.set(key, resolver);
    return resolver;
  },
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => ({ findOne }) },
}));
vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => ({ findOne }) },
}));
vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ({ previewGrant }) },
}));

function renderAssets(
  brandId: string,
  requests: StoryboardAssetRequest[],
  client = createTestQueryClient(),
) {
  return renderHook(() => useStoryboardAssets('run:1', brandId, requests), {
    wrapper: queryClientWrapper(client),
  });
}

describe('scoped storyboard asset reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolvers.clear();
  });
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
    const { result } = renderAssets(
      'brand',
      ['good', 'good', 'denied', 'deleted', 'other'].map((id) => ({
        id,
        kind: 'image',
      })),
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
        wrapper: queryClientWrapper(createTestQueryClient()),
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
  it('shows a still once its pending media grant is issued', async () => {
    findOne.mockResolvedValue({
      id: 'still',
      brandId: 'brand',
      cdnUrl: null,
      mediaDelivery: {
        expiresAt: null,
        id: 'still',
        purpose: 'preview',
        state: 'PENDING',
        url: null,
      },
    });
    previewGrant.mockResolvedValue({
      expiresAt: null,
      id: 'still',
      purpose: 'preview',
      state: 'READY',
      url: 'https://signed.test/still',
    });
    const { result } = renderAssets('brand', [{ id: 'still', kind: 'image' }]);
    await waitFor(() =>
      expect(result.current['image:still']?.cdnUrl).toBe(
        'https://signed.test/still',
      ),
    );
  });
  it('paints the cached assets at once when the storyboard is reopened', async () => {
    const client = createTestQueryClient();
    findOne.mockResolvedValue({
      id: 'still',
      brandId: 'brand',
      cdnUrl: 'https://cdn.test/still.png',
    });
    const requests: StoryboardAssetRequest[] = [{ id: 'still', kind: 'image' }];
    const first = renderAssets('brand', requests, client);
    await waitFor(() =>
      expect(first.result.current['image:still']?.cdnUrl).toBe(
        'https://cdn.test/still.png',
      ),
    );
    first.unmount();

    findOne.mockReturnValue(new Promise(() => {}));
    const { result } = renderAssets('brand', requests, client);

    expect(result.current['image:still']?.cdnUrl).toBe(
      'https://cdn.test/still.png',
    );
  });
  it('never paints one brand’s cached assets for another brand', async () => {
    const client = createTestQueryClient();
    findOne.mockResolvedValue({
      id: 'still',
      brandId: 'brand',
      cdnUrl: 'https://cdn.test/still.png',
    });
    const requests: StoryboardAssetRequest[] = [{ id: 'still', kind: 'image' }];
    const first = renderAssets('brand', requests, client);
    await waitFor(() =>
      expect(first.result.current['image:still']).toBeDefined(),
    );
    first.unmount();

    findOne.mockReturnValue(new Promise(() => {}));
    const { result } = renderAssets('other-brand', requests, client);

    expect(result.current).toEqual({});
  });
});
