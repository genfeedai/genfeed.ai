import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { Platform, Timeframe } from '@genfeedai/enums';
import type {
  IBrand,
  ITrend,
  ITrendHashtag,
  ITrendPlaybook,
  ITrendSound,
  ITrendVideo,
  IVideo,
} from '@genfeedai/interfaces';
import type { ICreatorWatchlist } from '@genfeedai/interfaces/analytics/creator-watchlist.interface';
import type { ITrendPlatformConfig } from '@genfeedai/interfaces/analytics/platform-config.interface';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TrendItem } from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { VideosService } from '@services/ingredients/videos.service';
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
const trendsCache = createLocalStorageCache({ prefix: 'trends:' });
const VIDEO_TIMEFRAME_MS = {
  [Timeframe.H24]: 24 * 60 * 60 * 1000,
  [Timeframe.H72]: 72 * 60 * 60 * 1000,
  [Timeframe.D7]: 7 * 24 * 60 * 60 * 1000,
} as const;

export function normalizeAnalyticsVideo(video: Video): ITrendVideo {
  const ingredient = video as IVideo;
  const evaluation = ingredient.evaluation;
  const actualPerformance = evaluation?.actualPerformance;
  const engagementScores = evaluation?.scores?.engagement;
  const brand =
    typeof ingredient.brand === 'object'
      ? (ingredient.brand as IBrand)
      : undefined;

  return {
    creatorHandle: brand?.label || 'Your brand',
    description: video.metadataDescription || undefined,
    engagementRate: actualPerformance?.engagementRate ?? 0,
    id: video.id || '',
    platform:
      evaluation?.externalContent?.platform || ingredient.provider || 'genfeed',
    publishedAt: ingredient.publishedAt || video.createdAt,
    thumbnailUrl: video.thumbnailUrl,
    title: video.metadataLabel || video.id?.slice(0, 8) || 'Untitled video',
    velocity: actualPerformance?.engagement ?? 0,
    videoUrl: video.ingredientUrl,
    viralScore:
      engagementScores?.viralityPotential ?? evaluation?.overallScore ?? 0,
    views: actualPerformance?.views ?? 0,
  };
}

export function useAnalyticsTrends() {
  const brandId = useBrandId();
  const analyticsContext = useOptionalAnalyticsContext();
  const surfaceFilters = analyticsContext?.filters;
  const setSurfaceFilter = analyticsContext?.setFilter;
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );
  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const [tiktokTrends, setTiktokTrends] = useState<ITrend[]>([]);
  const [youtubeTrends, setYoutubeTrends] = useState<ITrend[]>([]);
  const [twitterTrends, setTwitterTrends] = useState<ITrend[]>([]);
  const [instagramTrends, setInstagramTrends] = useState<ITrend[]>([]);
  const [creators, setCreators] = useState<ICreatorWatchlist[]>([]);
  const [playbooks, setPlaybooks] = useState<ITrendPlaybook[]>([]);

  // Trending topics from our backend
  const [trendingTopics, setTrendingTopics] = useState<TrendItem[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);

  // New state for hashtags and sounds
  const [trendingHashtags, setTrendingHashtags] = useState<ITrendHashtag[]>([]);
  const [trendingSounds, setTrendingSounds] = useState<ITrendSound[]>([]);
  const [isLoadingHashtags, setIsLoadingHashtags] = useState(true);
  const [isLoadingSounds, setIsLoadingSounds] = useState(true);

  // Filter states
  const [localVideoTimeframe, setLocalVideoTimeframe] = useState<
    Timeframe.H24 | Timeframe.H72 | Timeframe.D7
  >(Timeframe.H72);
  const [localHashtagPlatform, setLocalHashtagPlatform] = useState<string>('');
  const restoredTimeframe = surfaceFilters?.timeframe;
  const videoTimeframe = (
    [Timeframe.H24, Timeframe.H72, Timeframe.D7] as string[]
  ).includes(restoredTimeframe ?? '')
    ? (restoredTimeframe as Timeframe.H24 | Timeframe.H72 | Timeframe.D7)
    : localVideoTimeframe;
  const hashtagPlatform = surfaceFilters?.platform ?? localHashtagPlatform;

  const setVideoTimeframe = useCallback(
    (value: Timeframe.H24 | Timeframe.H72 | Timeframe.D7) => {
      setLocalVideoTimeframe(value);
      setSurfaceFilter?.('timeframe', value);
    },
    [setSurfaceFilter],
  );
  const setHashtagPlatform = useCallback(
    (value: string) => {
      setLocalHashtagPlatform(value);
      setSurfaceFilter?.('platform', value || undefined);
    },
    [setSurfaceFilter],
  );

  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);

  const videoCacheKey = `videos:${brandId}`;
  const { data: analyticsVideos = [], isLoading: isLoadingVideos } = useQuery<
    ITrendVideo[]
  >({
    enabled: Boolean(brandId),
    queryKey: ['analytics-trends-videos', brandId],
    queryFn: async ({ signal }) => {
      const service = await getVideosService();
      signal.throwIfAborted();

      try {
        const videos = await service.findAll(
          {
            brand: brandId,
            lightweight: true,
            limit: 12,
            sort: 'createdAt: -1',
          },
          signal,
        );
        const normalizedVideos = videos.map(normalizeAnalyticsVideo);

        trendsCache.set(videoCacheKey, normalizedVideos, TRENDS_CACHE_TTL);
        logger.info('Fetched analytics videos', {
          count: normalizedVideos.length,
        });
        return normalizedVideos;
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        logger.error('Failed to fetch analytics videos', { error });
        return (trendsCache.get(videoCacheKey) as ITrendVideo[] | null) ?? [];
      }
    },
    retry: false,
    staleTime: TRENDS_CACHE_TTL,
  });
  const viralVideos = useMemo(() => {
    const cutoff = Date.now() - VIDEO_TIMEFRAME_MS[videoTimeframe];

    return analyticsVideos.filter((video) => {
      const publishedAt = new Date(video.publishedAt ?? 0).getTime();
      return Number.isFinite(publishedAt) && publishedAt >= cutoff;
    });
  }, [analyticsVideos, videoTimeframe]);

  // Fetch trending topics from our TrendsService
  useEffect(() => {
    const controller = new AbortController();

    const fetchTrendingTopics = async () => {
      setIsLoadingTrends(true);
      try {
        const service = await getTrendsService();
        const data = await service.getTrendsDiscovery();
        setTrendingTopics(data.trends || []);
        logger.info('Fetched trending topics', {
          count: data.trends?.length ?? 0,
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch trending topics', { error });
      } finally {
        setIsLoadingTrends(false);
      }
    };

    fetchTrendingTopics();
    return () => controller.abort();
  }, [getTrendsService]);

  useEffect(() => {
    const controller = new AbortController();

    const findTrends = async () => {
      const url = 'GET /trends';

      try {
        if (controller.signal.aborted) {
          return;
        }
        const service = await getTrendsService();
        if (controller.signal.aborted) {
          return;
        }
        const data = await service.getTrendingTopics();

        setTiktokTrends(data.filter((t) => t.platform === Platform.TIKTOK));
        setYoutubeTrends(data.filter((t) => t.platform === Platform.YOUTUBE));
        setTwitterTrends(data.filter((t) => t.platform === Platform.TWITTER));
        setInstagramTrends(
          data.filter((t) => t.platform === Platform.INSTAGRAM),
        );
        setCreators([]);
        setPlaybooks([]);
        logger.info(`${url} success`, { count: data.length });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error(`${url} failed`, { error });
      }
    };

    findTrends();
    return () => controller.abort();
  }, [getTrendsService]);

  // Fetch trending hashtags from backend
  useEffect(() => {
    const controller = new AbortController();

    const fetchHashtags = async () => {
      setIsLoadingHashtags(true);
      try {
        const service = await getTrendsService();
        const hashtags = await service.getTrendingHashtags({
          limit: 12,
          platform: hashtagPlatform || undefined,
        });
        setTrendingHashtags(hashtags);
        trendsCache.set(
          `hashtags:${brandId}:${hashtagPlatform}`,
          hashtags,
          TRENDS_CACHE_TTL,
        );
        logger.info('Fetched trending hashtags', { count: hashtags.length });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch trending hashtags', { error });
        const ch = trendsCache.get(`hashtags:${brandId}:${hashtagPlatform}`) as
          | ITrendHashtag[]
          | null;
        if (ch) {
          setTrendingHashtags(ch);
        }
      } finally {
        setIsLoadingHashtags(false);
      }
    };

    fetchHashtags();
    return () => controller.abort();
  }, [brandId, getTrendsService, hashtagPlatform]);

  // Fetch trending sounds from backend
  useEffect(() => {
    const controller = new AbortController();

    const fetchSounds = async () => {
      setIsLoadingSounds(true);
      try {
        const service = await getTrendsService();
        const sounds = await service.getTrendingSounds({ limit: 12 });
        setTrendingSounds(sounds);
        trendsCache.set(`sounds:${brandId}`, sounds, TRENDS_CACHE_TTL);
        logger.info('Fetched trending sounds', { count: sounds.length });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch trending sounds', { error });
        const cs = trendsCache.get(`sounds:${brandId}`) as ITrendSound[] | null;
        if (cs) {
          setTrendingSounds(cs);
        }
      } finally {
        setIsLoadingSounds(false);
      }
    };

    fetchSounds();
    return () => controller.abort();
  }, [brandId, getTrendsService]);

  // Handle video click - open the hook remix modal so creators can remix
  // the viral clip. Falls back to opening the video URL for videos that
  // cannot be remixed (missing id/url).
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

  // Handle hashtag click - could filter or search
  const handleHashtagClick = useCallback((hashtag: ITrendHashtag) => {
    logger.info('Hashtag clicked', { hashtag: hashtag.hashtag });
  }, []);

  // Handle sound click - could preview or copy
  const handleSoundClick = useCallback((sound: ITrendSound) => {
    if (sound.playUrl) {
      window.open(sound.playUrl, '_blank');
    }
  }, []);

  const platformSections = useMemo(() => {
    const getTrendsByPlatform = (platformId: string): ITrend[] => {
      switch (platformId) {
        case 'tiktok':
          return tiktokTrends;
        case 'youtube':
          return youtubeTrends;
        case 'twitter':
          return twitterTrends;
        default:
          return instagramTrends;
      }
    };

    return TRENDS_PLATFORMS.map((config) => {
      const trendsByPlatform = getTrendsByPlatform(config.id);

      const sortedTrends = trendsByPlatform.toSorted(
        (a, b) => b.mentions - a.mentions,
      );

      const topVideos = viralVideos
        .filter((video: ITrendVideo) => video.platform === config.id)
        .slice(0, 3);

      const watchBrands = creators
        .filter((brand: ICreatorWatchlist) => brand.platform === config.id)
        .slice(0, 3);

      const totalMentions = trendsByPlatform.reduce(
        (acc, trend) => acc + trend.mentions,
        0,
      );

      const avgVelocity = topVideos.length
        ? Math.round(
            topVideos.reduce(
              (acc: number, video: ITrendVideo) => acc + video.velocity,
              0,
            ) / topVideos.length,
          )
        : 0;

      const avgEngagement = topVideos.length
        ? Number(
            (
              topVideos.reduce(
                (acc: number, video: ITrendVideo) => acc + video.engagementRate,
                0,
              ) / topVideos.length
            ).toFixed(1),
          )
        : 0;

      return {
        config,
        summary: {
          avgEngagement,
          avgVelocity,
          topTopic: sortedTrends[0] ?? null,
          totalMentions,
          trendingTopicsCount: trendsByPlatform.length,
        },
        topVideos,
        trends: sortedTrends,
        watchBrands,
      };
    });
  }, [
    instagramTrends,
    tiktokTrends,
    twitterTrends,
    youtubeTrends,
    viralVideos,
    creators,
  ]);

  const viralLeaderboard = useMemo(
    () =>
      viralVideos
        .slice()
        .sort((a: ITrendVideo, b: ITrendVideo) => b.viralScore - a.viralScore),
    [viralVideos],
  );

  const creatorLeaderboard = useMemo(
    () =>
      creators
        .slice()
        .sort(
          (a: ICreatorWatchlist, b: ICreatorWatchlist) =>
            b.growthRate - a.growthRate,
        )
        .slice(0, 6),
    [creators],
  );

  const lastSyncedAt = useMemo(() => {
    if (viralVideos.length === 0) {
      return null;
    }

    return viralVideos.reduce(
      (latest: Date, video: ITrendVideo) => {
        const published = new Date(video.publishedAt ?? 0);
        return published > latest ? published : latest;
      },
      new Date(viralVideos[0].publishedAt ?? 0),
    );
  }, [viralVideos]);

  const formattedLastSyncedAt = useMemo(
    () => (lastSyncedAt ? formatDate(lastSyncedAt) : ''),
    [lastSyncedAt],
  );

  const leadingPlatform = useMemo(() => {
    return platformSections.reduce<{
      label: string;
      totalMentions: number;
    } | null>((acc, section) => {
      if (!acc || section.summary.totalMentions > acc.totalMentions) {
        return {
          label: section.config.label,
          totalMentions: section.summary.totalMentions,
        };
      }
      return acc;
    }, null);
  }, [platformSections]);

  const totalTrackedTopics = useMemo(
    () =>
      platformSections.reduce(
        (acc, section) => acc + section.summary.trendingTopicsCount,
        0,
      ),
    [platformSections],
  );

  return {
    PLATFORM_CONFIG_LOOKUP: PLATFORM_CONFIGS,
    TRENDS_PLATFORMS,
    creatorLeaderboard,
    formattedLastSyncedAt,
    handleHashtagClick,
    handleRemixClose,
    handleSoundClick,
    handleVideoClick,
    hashtagPlatform,
    isLoadingHashtags,
    isLoadingSounds,
    isLoadingTrends,
    isLoadingVideos,
    leadingPlatform,
    platformSections,
    playbooks,
    remixVideo,
    setHashtagPlatform,
    setVideoTimeframe,
    totalTrackedTopics,
    trendingHashtags,
    trendingSounds,
    trendingTopics,
    videoTimeframe,
    viralLeaderboard,
    viralVideos,
  };
}
