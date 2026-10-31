import { Timeframe } from '@genfeedai/contracts';
import type {
  IDiscoveryTrendFilters,
  ITrendVideo,
} from '@genfeedai/contracts/interfaces';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { TrendsService } from '@services/social/trends.service';
import { useQuery } from '@tanstack/react-query';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { useState } from 'react';

const TRENDS_PLATFORMS = [
  PLATFORM_CONFIGS.tiktok,
  PLATFORM_CONFIGS.youtube,
  PLATFORM_CONFIGS.instagram,
  PLATFORM_CONFIGS.twitter,
  PLATFORM_CONFIGS.linkedin,
  PLATFORM_CONFIGS.reddit,
  PLATFORM_CONFIGS.pinterest,
];
export type ViralVideoTimeframe = Timeframe.H24 | Timeframe.H72 | Timeframe.D7;

export function useDiscoveryTrends() {
  const scope = useCollectionScope();
  const enabled = isBrandResourceReady(scope);
  const getService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );
  const scopeKey = JSON.stringify([scope.organizationId, scope.brandId]);
  const initialFilters: IDiscoveryTrendFilters = {
    scopeKey,
    relevance: 'brand',
    timeframe: Timeframe.H72,
    platform: '',
    hashtag: '',
  };
  const [filters, setFilters] = useState(initialFilters);
  const activeFilters =
    filters.scopeKey === scopeKey ? filters : initialFilters;
  const {
    relevance,
    timeframe: videoTimeframe,
    platform: hashtagPlatform,
    hashtag: selectedHashtag,
  } = activeFilters;
  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);
  if (filters.scopeKey !== scopeKey) {
    setFilters(initialFilters);
    setRemixVideo(null);
  }
  function setRelevance(value: 'market' | 'brand') {
    setFilters({ ...activeFilters, relevance: value, hashtag: '' });
    setRemixVideo(null);
  }
  function setVideoTimeframe(value: ViralVideoTimeframe) {
    setFilters({ ...activeFilters, timeframe: value, hashtag: '' });
    setRemixVideo(null);
  }
  function setHashtagPlatform(value: string) {
    setFilters({ ...activeFilters, platform: value, hashtag: '' });
    setRemixVideo(null);
  }
  function setSelectedHashtag(value: string) {
    setFilters({ ...activeFilters, hashtag: value });
  }
  const identity = [scope.organizationId, scope.brandId];
  const topics = useQuery({
    queryKey: [
      'discovery-topics',
      ...identity,
      relevance,
      hashtagPlatform,
      videoTimeframe,
    ],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getTrendsDiscovery({
        brandId: scope.brandId,
        relevance,
        platform: hashtagPlatform || undefined,
        timeframe: videoTimeframe,
        signal,
      }),
    staleTime: 30000,
    retry: false,
  });
  const videos = useQuery({
    queryKey: [
      'discovery-videos',
      ...identity,
      relevance,
      hashtagPlatform,
      videoTimeframe,
    ],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getViralVideos({
        brandId: scope.brandId,
        signal,
        platform: hashtagPlatform || undefined,
        relevance,
        limit: 100,
        timeframe: videoTimeframe,
      }),
    staleTime: 30000,
    retry: false,
  });
  const health = useQuery({
    queryKey: ['discovery-health', ...identity],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getCorpusFreshnessHealth(signal),
    staleTime: 30000,
    retry: false,
  });
  const hashtags = useQuery({
    queryKey: [
      'discovery-hashtags',
      ...identity,
      relevance,
      hashtagPlatform,
      videoTimeframe,
    ],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getTrendingHashtags({
        brandId: scope.brandId,
        signal,
        relevance,
        timeframe: videoTimeframe,
        platform: hashtagPlatform || undefined,
        limit: 24,
      }),
    staleTime: 30000,
    retry: false,
  });
  const sounds = useQuery({
    queryKey: [
      'discovery-sounds',
      ...identity,
      relevance,
      hashtagPlatform,
      videoTimeframe,
    ],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getTrendingSounds({
        brandId: scope.brandId,
        limit: 12,
        relevance,
        platform: hashtagPlatform || undefined,
        timeframe: videoTimeframe,
        signal,
      }),
    staleTime: 30000,
    retry: false,
  });
  const allVideos = videos.data ?? [];
  const viralVideos = selectedHashtag
    ? allVideos.filter((video) =>
        (video.hashtags ?? []).some(
          (tag) =>
            tag.replace(/^#/, '').toLowerCase() ===
            selectedHashtag.toLowerCase(),
        ),
      )
    : allVideos;
  const timestamps = (health.data?.refreshHealth ?? [])
    .flatMap((receipt) =>
      receipt.lastSuccessfulRefreshAt ? [receipt.lastSuccessfulRefreshAt] : [],
    )
    .sort();
  const latest = timestamps.at(-1);
  const leading = (topics.data?.trends ?? []).toSorted(
    (a, b) => b.mentions - a.mentions,
  )[0];
  return {
    PLATFORM_CONFIG_LOOKUP: PLATFORM_CONFIGS,
    TRENDS_PLATFORMS,
    relevance,
    setRelevance,
    selectedHashtag,
    setSelectedHashtag,
    corpusHealth: health.data ?? null,
    isCorpusHealthUnavailable: Boolean(health.error),
    formattedLastSyncedAt: latest ? formatDate(latest) : '',
    trendingTopics: topics.data?.trends ?? [],
    isLoadingTrends: topics.isLoading,
    viralVideos,
    isLoadingVideos: videos.isLoading,
    trendingHashtags: hashtags.data ?? [],
    isLoadingHashtags: hashtags.isLoading,
    trendingSounds: sounds.data ?? [],
    isLoadingSounds: sounds.isLoading,
    error: topics.error || videos.error || hashtags.error || sounds.error,
    videoTimeframe,
    setVideoTimeframe,
    hashtagPlatform,
    setHashtagPlatform,
    totalTrackedTopics: topics.data?.trends.length ?? 0,
    leadingPlatform: leading
      ? {
          label: PLATFORM_CONFIGS[leading.platform]?.label ?? leading.platform,
          totalMentions: leading.mentions,
        }
      : null,
    remixVideo: filters.scopeKey === scopeKey ? remixVideo : null,
    handleRemixClose: () => setRemixVideo(null),
    handleVideoClick: setRemixVideo,
    reload: () =>
      Promise.all([
        topics.refetch(),
        videos.refetch(),
        health.refetch(),
        hashtags.refetch(),
        sounds.refetch(),
      ]),
  };
}
