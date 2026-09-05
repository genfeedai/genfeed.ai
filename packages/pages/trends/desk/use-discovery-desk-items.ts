'use client';

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
  TrendCorpusFreshnessHealth,
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

const FOLLOWING_POSTS_LIMIT = 100;
const VIRAL_VIDEOS_LIMIT = 12;

export interface UseDiscoveryDeskItemsReturn {
  corpusHealth: TrendCorpusFreshnessHealth | null;
  healthError: Error | null;
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
  const { brandId, organizationId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const queryClient = useQueryClient();

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );

  const {
    data: corpusHealth,
    error: healthError,
    isFetching: isFetchingHealth,
    refetch: refetchHealth,
  } = useQuery<TrendCorpusFreshnessHealth>({
    enabled: isBrandReady,
    queryFn: async ({ signal }) => {
      const service = await getTrendsService();
      return service.getCorpusFreshnessHealth(signal);
    },
    queryKey: ['trend-corpus-health', organizationId, brandId],
  });

  const trendContentQueryKey = ['trend-content', brandId, undefined];
  const {
    data: trendContent = EMPTY_TREND_CONTENT,
    error: trendContentError,
    isLoading: isLoadingTrendContent,
    isFetching: isFetchingTrendContent,
    refetch: refetchTrendContent,
  } = useQuery<TrendContentResponse>({
    enabled: isBrandReady,
    initialData: EMPTY_TREND_CONTENT,
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
    refetch: refetchFollowingFeed,
  } = useQuery<SocialSourcesResponse>({
    enabled: isBrandReady,
    initialData: EMPTY_FEED,
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
    refetch: refetchViralVideos,
  } = useQuery<ITrendVideo[]>({
    enabled: isBrandReady,
    initialData: [],
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: VIRAL_VIDEOS_LIMIT });
    },
    queryKey: viralVideosQueryKey,
  });

  const items = useMemo<DiscoveryDeskItem[]>(
    () => [
      ...trendContent.items.map(toDeskItemFromTrend),
      ...followingFeed.posts.map(toDeskItemFromSourcePost),
      ...viralVideos.map(toDeskItemFromViralVideo),
    ],
    [trendContent.items, followingFeed.posts, viralVideos],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trend-content'] }),
      queryClient.invalidateQueries({ queryKey: ['social-sources-feed'] }),
      queryClient.invalidateQueries({ queryKey: viralVideosQueryKey }),
    ]);
    await Promise.all([
      refetchHealth(),
      refetchTrendContent(),
      refetchFollowingFeed(),
      refetchViralVideos(),
    ]);
  }, [
    queryClient,
    refetchFollowingFeed,
    refetchHealth,
    refetchTrendContent,
    refetchViralVideos,
    viralVideosQueryKey,
  ]);

  const isLoading =
    isLoadingTrendContent || isLoadingFollowingFeed || isLoadingViralVideos;
  const isFetching =
    isFetchingHealth ||
    isFetchingTrendContent ||
    isFetchingFollowingFeed ||
    isFetchingViralVideos;

  return {
    corpusHealth: corpusHealth ?? null,
    healthError: healthError ?? null,
    error: trendContentError ?? followingFeedError ?? viralVideosError ?? null,
    isLoading,
    isRefreshing: isFetching && !isLoading,
    items,
    refresh,
    sources: followingFeed.sources,
    summary: trendContent.summary,
  };
}
