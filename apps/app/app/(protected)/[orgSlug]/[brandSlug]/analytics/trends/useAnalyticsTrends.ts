import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { Platform, Timeframe } from '@genfeedai/enums';
import type {
  ITrend,
  ITrendHashtag,
  ITrendPlaybook,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';
import type { ICreatorWatchlist } from '@genfeedai/interfaces/analytics/creator-watchlist.interface';
import type { ITrendPlatformConfig } from '@genfeedai/interfaces/analytics/platform-config.interface';
import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TrendItem } from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { TrendsService } from '@services/social/trends.service';
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

export function useAnalyticsTrends() {
  const brandId = useBrandId();
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const [tiktokTrends, setTiktokTrends] = useState<ITrend[]>([]);
  const [youtubeTrends, setYoutubeTrends] = useState<ITrend[]>([]);
  const [twitterTrends, setTwitterTrends] = useState<ITrend[]>([]);
  const [instagramTrends, setInstagramTrends] = useState<ITrend[]>([]);
  const [viralVideos, setViralVideos] = useState<ITrendVideo[]>([]);
  const [creators, setCreators] = useState<ICreatorWatchlist[]>([]);
  const [playbooks, setPlaybooks] = useState<ITrendPlaybook[]>([]);

  // Trending topics from our backend
  const [trendingTopics, setTrendingTopics] = useState<TrendItem[]>([]);
  const [isLoadingTrends, setIsLoadingTrends] = useState(true);

  // New state for hashtags and sounds
  const [trendingHashtags, setTrendingHashtags] = useState<ITrendHashtag[]>([]);
  const [trendingSounds, setTrendingSounds] = useState<ITrendSound[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(true);
  const [isLoadingHashtags, setIsLoadingHashtags] = useState(true);
  const [isLoadingSounds, setIsLoadingSounds] = useState(true);

  // Filter states
  const [videoTimeframe, setVideoTimeframe] = useState<
    Timeframe.H24 | Timeframe.H72 | Timeframe.D7
  >(Timeframe.H72);
  const [hashtagPlatform, setHashtagPlatform] = useState<string>('');

  const [remixVideo, setRemixVideo] = useState<ITrendVideo | null>(null);

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

  // Fetch viral videos from backend
  useEffect(() => {
    const controller = new AbortController();

    const fetchViralVideos = async () => {
      setIsLoadingVideos(true);
      try {
        const service = await getTrendsService();
        const videos = await service.getViralVideos({
          limit: 12,
          timeframe: videoTimeframe,
        });
        setViralVideos(videos);
        trendsCache.set(
          `viral:${brandId}:${videoTimeframe}`,
          videos,
          TRENDS_CACHE_TTL,
        );
        logger.info('Fetched viral videos', { count: videos.length });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch viral videos', { error });
        const cv = trendsCache.get(`viral:${brandId}:${videoTimeframe}`) as
          | ITrendVideo[]
          | null;
        if (cv) {
          setViralVideos(cv);
        }
      } finally {
        setIsLoadingVideos(false);
      }
    };

    fetchViralVideos();
    return () => controller.abort();
  }, [brandId, getTrendsService, videoTimeframe]);

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
