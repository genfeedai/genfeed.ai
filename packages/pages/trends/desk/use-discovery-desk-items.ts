'use client';

import { SocialSourceType } from '@genfeedai/contracts';
import type {
  ISocialSource,
  ITrendVideo,
  SocialSourcesResponse,
} from '@genfeedai/contracts/interfaces';
import { SocialSourcesService } from '@genfeedai/services/social/social-sources.service';
import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import type {
  TrendContentResponse,
  TrendsSummary,
} from '@props/trends/trends-page.props';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  toDeskItemFromSourcePost,
  toDeskItemFromTrend,
  toDeskItemFromViralVideo,
} from './desk-items';

const EMPTY_SUMMARY: TrendsSummary = {
  connectedPlatforms: [],
  lockedPlatforms: [],
  totalItems: 0,
  totalTrends: 0,
};

const EMPTY_TREND_CONTENT: TrendContentResponse = {
  items: [],
  summary: EMPTY_SUMMARY,
};

const EMPTY_FEED: SocialSourcesResponse = {
  posts: [],
  sources: [],
  summary: {
    activeSources: 0,
    totalPosts: 0,
    totalSources: 0,
  },
};

// `placeholderData`, never `initialData`: the shared QueryClient has a 30s
// staleTime, and initialData is treated as a fresh cache entry, so the Desk
// would mount with the empty placeholder and skip the real fetch until a
// manual refresh invalidated it.
const FOLLOWING_POSTS_LIMIT = 100;
const VIRAL_VIDEOS_LIMIT = 12;

export interface UseDiscoveryDeskItemsReturn {
  items: DiscoveryDeskItem[];
  summary: TrendsSummary;
  sources: ISocialSource[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useDiscoveryDeskItems(): UseDiscoveryDeskItemsReturn {
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const queryClient = useQueryClient();

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );

  const trendContentQueryKey = ['trend-content', brandId, undefined];
  const {
    data: trendContent = EMPTY_TREND_CONTENT,
    error: trendContentError,
    isLoading: isLoadingTrendContent,
    isFetching: isFetchingTrendContent,
    isPlaceholderData: isPlaceholderTrendContent,
    refetch: refetchTrendContent,
  } = useQuery<TrendContentResponse>({
    enabled: isBrandReady,
    placeholderData: EMPTY_TREND_CONTENT,
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getTrendContent({});
    },
    queryKey: trendContentQueryKey,
  });

  const followingFeedQueryKey = ['social-sources-feed', brandId, undefined, ''];
  const {
    data: followingFeed = EMPTY_FEED,
    error: followingFeedError,
    isLoading: isLoadingFollowingFeed,
    isFetching: isFetchingFollowingFeed,
    isPlaceholderData: isPlaceholderFollowingFeed,
    refetch: refetchFollowingFeed,
  } = useQuery<SocialSourcesResponse>({
    enabled: isBrandReady,
    placeholderData: EMPTY_FEED,
    queryFn: async () => {
      const service = await getSocialSourcesService();
      return service.getFollowingFeed({
        brandId,
        postsLimit: FOLLOWING_POSTS_LIMIT,
      });
    },
    queryKey: followingFeedQueryKey,
  });

  const viralVideosQueryKey = useMemo(
    () => ['trends-list-viral-videos', brandId],
    [brandId],
  );
  const {
    data: viralVideos = [],
    error: viralVideosError,
    isLoading: isLoadingViralVideos,
    isFetching: isFetchingViralVideos,
    isPlaceholderData: isPlaceholderViralVideos,
    refetch: refetchViralVideos,
  } = useQuery<ITrendVideo[]>({
    enabled: isBrandReady,
    placeholderData: [],
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: VIRAL_VIDEOS_LIMIT });
    },
    queryKey: viralVideosQueryKey,
  });

  const items = useMemo<DiscoveryDeskItem[]>(() => {
    const ownAccountSourceIds = new Set(
      followingFeed.sources
        .filter((source) => source.sourceType === SocialSourceType.OWN_ACCOUNT)
        .map((source) => source.id),
    );
    return [
      ...trendContent.items.map(toDeskItemFromTrend),
      ...followingFeed.posts.map((post) =>
        toDeskItemFromSourcePost(post, {
          isOwnAccount: ownAccountSourceIds.has(post.sourceId),
        }),
      ),
      ...viralVideos.map(toDeskItemFromViralVideo),
    ];
  }, [
    trendContent.items,
    followingFeed.posts,
    followingFeed.sources,
    viralVideos,
  ]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trend-content'] }),
      queryClient.invalidateQueries({ queryKey: ['social-sources-feed'] }),
      queryClient.invalidateQueries({ queryKey: viralVideosQueryKey }),
    ]);
    await Promise.all([
      refetchTrendContent(),
      refetchFollowingFeed(),
      refetchViralVideos(),
    ]);
  }, [
    queryClient,
    refetchFollowingFeed,
    refetchTrendContent,
    refetchViralVideos,
    viralVideosQueryKey,
  ]);

  // `placeholderData` reports a successful query while the first request is
  // still in flight, so a cache miss shows up as fetching placeholder data
  // rather than as `isLoading`. Treat it as the initial load.
  const isLoading =
    isLoadingTrendContent ||
    isLoadingFollowingFeed ||
    isLoadingViralVideos ||
    (isFetchingTrendContent && isPlaceholderTrendContent) ||
    (isFetchingFollowingFeed && isPlaceholderFollowingFeed) ||
    (isFetchingViralVideos && isPlaceholderViralVideos);
  const isFetching =
    isFetchingTrendContent || isFetchingFollowingFeed || isFetchingViralVideos;

  return {
    error: trendContentError ?? followingFeedError ?? viralVideosError ?? null,
    isLoading,
    isRefreshing: isFetching && !isLoading,
    items,
    refresh,
    sources: followingFeed.sources,
    summary: trendContent.summary,
  };
}
