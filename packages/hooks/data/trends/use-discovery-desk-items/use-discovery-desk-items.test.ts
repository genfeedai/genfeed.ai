import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTrendContent = vi.fn();
const mockGetFollowingFeed = vi.fn();
const mockGetViralVideos = vi.fn();
const mockGetTrendsService = vi.fn();
const mockGetSocialSourcesService = vi.fn();
const mockUseCollectionScope = vi.fn();

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isBrandResourceReady: (scope: { brandId?: string; isReady: boolean }) =>
    Boolean(scope.isReady && scope.brandId),
  useCollectionScope: () => mockUseCollectionScope(),
}));

let authedServiceCallCount = 0;
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (_factory: (token: string) => unknown) => {
    authedServiceCallCount += 1;
    return authedServiceCallCount % 2 === 1
      ? mockGetTrendsService
      : mockGetSocialSourcesService;
  },
}));

vi.mock('@genfeedai/services/social/trends.service', () => ({
  TrendsService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/social/social-sources.service', () => ({
  SocialSourcesService: { getInstance: vi.fn() },
}));

vi.mock('@pages/trends/desk/desk-items', () => ({
  toDeskItemFromSourcePost: (post: { id: string }) => ({
    key: `source_post:${post.id}`,
    kind: 'source_post',
  }),
  toDeskItemFromTrend: (item: { id: string }) => ({
    key: `trend:${item.id}`,
    kind: 'trend',
  }),
  toDeskItemFromViralVideo: (video: { id: string }) => ({
    key: `viral_video:${video.id}`,
    kind: 'viral_video',
  }),
}));

import { useDiscoveryDeskItems } from './use-discovery-desk-items';

const TREND_ITEM = { id: 'trend-1' };
const SUMMARY = {
  connectedPlatforms: ['instagram'],
  lockedPlatforms: [],
  totalItems: 1,
  totalTrends: 1,
};
const SOURCE_POST = { id: 'post-1' };
const SOCIAL_SOURCE = { id: 'source-1' };
const VIRAL_VIDEO = { id: 'video-1' };

describe('useDiscoveryDeskItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authedServiceCallCount = 0;

    mockUseCollectionScope.mockReturnValue({
      brandId: 'brand-1',
      isReady: true,
      organizationId: 'org-1',
      pageScope: 'brand',
    });

    mockGetTrendContent.mockResolvedValue({
      items: [TREND_ITEM],
      summary: SUMMARY,
    });
    mockGetFollowingFeed.mockResolvedValue({
      posts: [SOURCE_POST],
      sources: [SOCIAL_SOURCE],
      summary: { activeSources: 1, totalPosts: 1, totalSources: 1 },
    });
    mockGetViralVideos.mockResolvedValue([VIRAL_VIDEO]);

    mockGetTrendsService.mockResolvedValue({
      getTrendContent: mockGetTrendContent,
      getViralVideos: mockGetViralVideos,
    });
    mockGetSocialSourcesService.mockResolvedValue({
      getFollowingFeed: mockGetFollowingFeed,
    });
  });

  it('combines trend content, the following feed, and viral videos into one item list', async () => {
    const { result } = renderHook(() => useDiscoveryDeskItems(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(3);
    });

    expect(result.current.items.map((item) => item.key)).toEqual([
      'trend:trend-1',
      'source_post:post-1',
      'viral_video:video-1',
    ]);
    expect(result.current.summary).toEqual(SUMMARY);
    expect(result.current.sources).toEqual([SOCIAL_SOURCE]);
    expect(result.current.error).toBeNull();
    expect(mockGetFollowingFeed).toHaveBeenCalledWith({
      brandId: 'brand-1',
      postsLimit: 100,
    });
    expect(mockGetViralVideos).toHaveBeenCalledWith({ limit: 12 });
  });

  it('does not fetch when the brand is not ready', () => {
    mockUseCollectionScope.mockReturnValue({
      brandId: undefined,
      isReady: true,
      organizationId: 'org-1',
      pageScope: 'brand',
    });

    renderHook(() => useDiscoveryDeskItems(), {
      wrapper: createQueryWrapper(),
    });

    expect(mockGetTrendContent).not.toHaveBeenCalled();
    expect(mockGetFollowingFeed).not.toHaveBeenCalled();
    expect(mockGetViralVideos).not.toHaveBeenCalled();
  });

  it('starts with an empty item list before data resolves', () => {
    const { result } = renderHook(() => useDiscoveryDeskItems(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.summary.totalItems).toBe(0);
    expect(result.current.sources).toEqual([]);
  });

  it('refresh invalidates and refetches all three sources', async () => {
    const { result } = renderHook(() => useDiscoveryDeskItems(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(3);
    });

    mockGetTrendContent.mockClear();
    mockGetFollowingFeed.mockClear();
    mockGetViralVideos.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGetTrendContent).toHaveBeenCalled();
    expect(mockGetFollowingFeed).toHaveBeenCalled();
    expect(mockGetViralVideos).toHaveBeenCalled();
  });

  it('surfaces an error from any of the three queries', async () => {
    mockGetTrendContent.mockRejectedValue(new Error('trend content failed'));

    const { result } = renderHook(() => useDiscoveryDeskItems(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error?.message).toBe('trend content failed');
  });
});
