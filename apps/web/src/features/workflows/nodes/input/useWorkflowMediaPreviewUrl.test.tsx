import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWorkflowMediaConfig } from './media-picker';
import { useWorkflowMediaPreviewUrl } from './useWorkflowMediaPreviewUrl';

const mocks = vi.hoisted(() => ({
  brandId: 'brand',
  findOne: vi.fn(),
  resolvers: new Map<string, () => Promise<unknown>>(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: mocks.brandId }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const key = factory.toString();
    const existing = mocks.resolvers.get(key);
    if (existing) return existing;
    const resolver = async () => factory('token');
    mocks.resolvers.set(key, resolver);
    return resolver;
  },
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));
vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => ({ findOne: mocks.findOne }) },
}));
vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => ({ findOne: mocks.findOne }) },
}));
vi.mock('@hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: (ingredient: IIngredient | null) =>
    ingredient?.mediaDelivery ?? null,
}));

const savedVideo = getWorkflowMediaConfig(
  {
    config: {
      itemCategory: 'video',
      itemId: 'private-video',
      resolvedUrl: 'https://cdn.test/ingredients/videos/private-video',
      source: 'library',
    },
  },
  'video',
);
const currentVideo = {
  id: 'private-video',
  brandId: 'brand',
  isDeleted: false,
  mediaDelivery: {
    expiresAt: null,
    id: 'private-video',
    purpose: 'preview',
    state: 'READY',
    url: 'https://signed.test/current.mp4?Signature=issued',
  },
};

function renderPreview() {
  const client = createTestQueryClient();
  return {
    ...renderHook(() => useWorkflowMediaPreviewUrl('video', savedVideo), {
      wrapper: queryClientWrapper(client),
    }),
    client,
  };
}

describe('workflow Library media previews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvers.clear();
    mocks.brandId = 'brand';
  });

  it('reauthorizes a saved Library ID rather than playing its stored unsigned URL', async () => {
    mocks.findOne.mockResolvedValue(currentVideo);
    const { result } = renderPreview();
    expect(result.current).toBeUndefined();
    await waitFor(() =>
      expect(result.current).toBe(
        'https://signed.test/current.mp4?Signature=issued',
      ),
    );
    expect(mocks.findOne).toHaveBeenCalledWith(
      'private-video',
      { brandId: 'brand', isDeleted: false },
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['another brand', { ...currentVideo, brandId: 'other' }],
    ['a deleted asset', { ...currentVideo, isDeleted: true }],
    ['another asset', { ...currentVideo, id: 'other' }],
  ])('does not preview %s', async (_label, response) => {
    mocks.findOne.mockResolvedValue(response);
    const { result, client } = renderPreview();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(result.current).toBeUndefined();
  });

  it('clears the former brand preview while the new brand read is pending', async () => {
    mocks.findOne.mockResolvedValueOnce(currentVideo);
    const { result, rerender } = renderPreview();
    await waitFor(() => expect(result.current).toContain('signed.test'));
    mocks.findOne.mockReturnValue(new Promise(() => {}));
    mocks.brandId = 'other-brand';
    rerender();
    expect(result.current).toBeUndefined();
  });

  it('leaves explicitly supplied video URLs unchanged without an ingredient read', () => {
    const config = getWorkflowMediaConfig(
      { config: { source: 'url', url: 'https://owned.test/video.mp4' } },
      'video',
    );
    const { result } = renderHook(() => useWorkflowMediaPreviewUrl('video', config), {
      wrapper: queryClientWrapper(createTestQueryClient()),
    });
    expect(result.current).toBe('https://owned.test/video.mp4');
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});
