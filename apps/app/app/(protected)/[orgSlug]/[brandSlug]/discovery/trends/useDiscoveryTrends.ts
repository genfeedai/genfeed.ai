import { type Platform, Timeframe } from '@genfeedai/contracts';
import type {
  ITrend,
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/contracts/interfaces';
import type { ITrendPlatformConfig } from '@genfeedai/contracts/interfaces/analytics/platform-config.interface';
import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type {
  TrendCorpusFreshnessHealth,
  TrendItem,
} from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { TrendsService } from '@services/social/trends.service';
import { useQuery } from '@tanstack/react-query';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { useCallback, useEffect, useMemo, useState } from 'react';

const TRENDS_PLATFORMS: ITrendPlatformConfig[] = [
  PLATFORM_CONFIGS.tiktok,
  PLATFORM_CONFIGS.youtube,
  PLATFORM_CONFIGS.instagram,
  PLATFORM_CONFIGS.twitter,
  PLATFORM_CONFIGS.reddit,
  PLATFORM_CONFIGS.pinterest,
];

const TRENDS_CACHE_TTL = 30 * 60 * 1000;
const VIRAL_VIDEOS_LIMIT = 12;
const trendsCache = createLocalStorageCache({ prefix: 'trends:' });

export type ViralVideoTimeframe = Timeframe.H24 | Timeframe.H72 | Timeframe.D7;

/**
 * Market trend data for Discovery › Trends: trending topics, viral videos,
 * hashtags and sounds from the shared trend corpus, plus corpus health.
 * Nothing here is the brand's own performance — that lives in Analytics.
 */
export function useDiscoveryTrends() {
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const [platformTrends, setPlatformTrends] = useState<ITrend[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<TrendItem[]>([]);
  const [corpusHealth, setCorpusHealth] =
    useState<TrendCorpusFreshnessHealth | null>(null);
  const [isCorpusHealthUnavailable, setIsCorpusHealthUnavailable] =
    useState(false);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);
  const [trendingHashtags, setTrendingHashtags] = useState<ITrendHashtag[]>([]);
  const [trendingSounds, setTrendingSounds] = useState<ITrendSound[]>([]);
  const [isLoadingHashtags, setIsLoadingHashtags] = useState(true);
  const [isLoadingSounds, setIsLoadingSounds] = useState(true);
  const [videoTimeframe, setVideoTimeframe] = useState<ViralVideoTimeframe>(
    Timeframe.H72,
  );
  const [hashtagPlatform, setHashtagPlatform] = useState<string>('');
  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);

  const { data: viralVideos = [], isLoading: isLoadingVideos } = useQuery<
    ITrendVideo[]
  >({
    enabled: isBrandReady,
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getViralVideos({
        limit: VIRAL_VIDEOS_LIMIT,
        timeframe: videoTimeframe,
      });
    },
    queryKey: ['discovery-trends-viral-videos', brandId, videoTimeframe],
    retry: false,
    staleTime: TRENDS_CACHE_TTL,
  });

  useEffect(() => {
    // getTrendsService is re-memoised while sessionId/userId/orgId hydrate, so
    // an ungated effect re-fires on every identity step. Wait for the scope.
    if (!isBrandReady) {
      return;
    }

    const controller = new AbortController();

    const fetchTrendingTopics = async () => {
      setIsLoadingTrends(true);
      try {
        controller.signal.throwIfAborted();
        const service = await getTrendsService();
        controller.signal.throwIfAborted();
        const data = await service.getTrendsDiscovery({
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        setTrendingTopics(data.trends || []);
      } catch (error) {
        // Superseded fetches reject with whatever the transport throws, so the
        // signal is the reliable check — not the error's name.
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to fetch trending topics', { error });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingTrends(false);
        }
      }
    };

    fetchTrendingTopics();
    return () => controller.abort();
  }, [getTrendsService, isBrandReady]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchCorpusHealth = async () => {
      setIsCorpusHealthUnavailable(false);
      try {
        controller.signal.throwIfAborted();
        const service = await getTrendsService();
        controller.signal.throwIfAborted();
        const health = await service.getCorpusFreshnessHealth(
          controller.signal,
        );
        controller.signal.throwIfAborted();
        setCorpusHealth(health);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to fetch trend corpus health', { error });
        setIsCorpusHealthUnavailable(true);
      }
    };

    fetchCorpusHealth();
    return () => controller.abort();
  }, [getTrendsService]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchPlatformTrends = async () => {
      try {
        const service = await getTrendsService();
        if (controller.signal.aborted) {
          return;
        }
        const data = await service.getTrendingTopics();
        if (!controller.signal.aborted) {
          setPlatformTrends(data);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('GET /trends failed', { error });
      }
    };

    fetchPlatformTrends();
    return () => controller.abort();
  }, [getTrendsService]);

  useEffect(() => {
    if (!isBrandReady) {
      return;
    }

    const controller = new AbortController();
    const cacheKey = `hashtags:${brandId}:${hashtagPlatform}`;

    const fetchHashtags = async () => {
      setIsLoadingHashtags(true);
      try {
        controller.signal.throwIfAborted();
        const service = await getTrendsService();
        controller.signal.throwIfAborted();
        const hashtags = await service.getTrendingHashtags({
          limit: 12,
          platform: hashtagPlatform || undefined,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        setTrendingHashtags(hashtags);
        trendsCache.set(cacheKey, hashtags, TRENDS_CACHE_TTL);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to fetch trending hashtags', { error });
        const cached = trendsCache.get(cacheKey) as ITrendHashtag[] | null;
        if (cached) {
          setTrendingHashtags(cached);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingHashtags(false);
        }
      }
    };

    fetchHashtags();
    return () => controller.abort();
  }, [brandId, getTrendsService, hashtagPlatform, isBrandReady]);

  useEffect(() => {
    if (!isBrandReady) {
      return;
    }

    const controller = new AbortController();
    const cacheKey = `sounds:${brandId}`;

    const fetchSounds = async () => {
      setIsLoadingSounds(true);
      try {
        controller.signal.throwIfAborted();
        const service = await getTrendsService();
        controller.signal.throwIfAborted();
        const sounds = await service.getTrendingSounds({
          limit: 12,
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        setTrendingSounds(sounds);
        trendsCache.set(cacheKey, sounds, TRENDS_CACHE_TTL);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to fetch trending sounds', { error });
        const cached = trendsCache.get(cacheKey) as ITrendSound[] | null;
        if (cached) {
          setTrendingSounds(cached);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSounds(false);
        }
      }
    };

    fetchSounds();
    return () => controller.abort();
  }, [brandId, getTrendsService, isBrandReady]);

  // Viral clips open the hook remix modal; clips that cannot be remixed
  // (missing id) fall back to the source URL.
  const handleVideoClick = useCallback((video: ITrendVideo) => {
    if (video?.id) {
      setRemixVideo(video);
      return;
    }
    if (video?.videoUrl) {
      window.open(video.videoUrl, '_blank');
    }
  }, []);

  const handleRemixClose = useCallback(() => {
    setRemixVideo(null);
  }, []);

  const handleSoundClick = useCallback((sound: ITrendSound) => {
    if (sound.playUrl) {
      window.open(sound.playUrl, '_blank');
    }
  }, []);

  const mentionsByPlatform = useMemo(() => {
    const totals = new Map<string, { mentions: number; topics: number }>();
    for (const trend of platformTrends) {
      const current = totals.get(trend.platform) ?? { mentions: 0, topics: 0 };
      totals.set(trend.platform, {
        mentions: current.mentions + trend.mentions,
        topics: current.topics + 1,
      });
    }
    return totals;
  }, [platformTrends]);

  const leadingPlatform = useMemo(() => {
    return TRENDS_PLATFORMS.reduce<{
      label: string;
      totalMentions: number;
    } | null>((acc, config) => {
      const totalMentions =
        mentionsByPlatform.get(config.id as Platform)?.mentions ?? 0;
      if (!acc || totalMentions > acc.totalMentions) {
        return { label: config.label, totalMentions };
      }
      return acc;
    }, null);
  }, [mentionsByPlatform]);

  const totalTrackedTopics = useMemo(
    () =>
      TRENDS_PLATFORMS.reduce(
        (acc, config) =>
          acc + (mentionsByPlatform.get(config.id as Platform)?.topics ?? 0),
        0,
      ),
    [mentionsByPlatform],
  );

  const formattedLastSyncedAt = useMemo(() => {
    const timestamps = (corpusHealth?.segments ?? [])
      .map((segment) => segment.latestSeenAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => Number.isFinite(value.getTime()));

    if (timestamps.length === 0) {
      return '';
    }

    return formatDate(
      timestamps.reduce((latest, value) => (value > latest ? value : latest)),
    );
  }, [corpusHealth]);

  return {
    PLATFORM_CONFIG_LOOKUP: PLATFORM_CONFIGS,
    TRENDS_PLATFORMS,
    corpusHealth,
    formattedLastSyncedAt,
    handleRemixClose,
    handleSoundClick,
    handleVideoClick,
    hashtagPlatform,
    isCorpusHealthUnavailable,
    isLoadingHashtags,
    isLoadingSounds,
    isLoadingTrends,
    isLoadingVideos,
    leadingPlatform,
    remixVideo,
    setHashtagPlatform,
    setVideoTimeframe,
    totalTrackedTopics,
    trendingHashtags,
    trendingSounds,
    trendingTopics,
    videoTimeframe,
    viralVideos,
  };
}
