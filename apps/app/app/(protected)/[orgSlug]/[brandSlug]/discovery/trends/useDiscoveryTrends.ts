import { Timeframe } from '@genfeedai/contracts';
import type { ITrendVideo } from '@genfeedai/contracts/interfaces';
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
  const [relevance, setRelevance] = useState<'market' | 'brand'>('market');
  const [videoTimeframe, setVideoTimeframe] = useState<ViralVideoTimeframe>(
    Timeframe.H72,
  );
  const [hashtagPlatform, setHashtagPlatform] = useState('');
  const [selectedHashtag, setSelectedHashtag] = useState('');
  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);
  const identity = [scope.organizationId, scope.brandId];
  const topics = useQuery({
    queryKey: ['discovery-topics', ...identity, relevance],
    enabled,
    queryFn: async ({ signal }) =>
      (await getService()).getTrendsDiscovery({ relevance, signal }),
    staleTime: 30000,
    retry: false,
  });
  const videos = useQuery({
    queryKey: ['discovery-videos', ...identity, relevance, videoTimeframe],
    enabled,
    queryFn: async () =>
      (await getService()).getViralVideos({
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
    queryKey: ['discovery-hashtags', ...identity, hashtagPlatform],
    enabled,
    queryFn: async () =>
      (await getService()).getTrendingHashtags({
        platform: hashtagPlatform || undefined,
        limit: 24,
      }),
    staleTime: 30000,
    retry: false,
  });
  const sounds = useQuery({
    queryKey: ['discovery-sounds', ...identity],
    enabled,
    queryFn: async () => (await getService()).getTrendingSounds({ limit: 12 }),
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
    remixVideo,
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
