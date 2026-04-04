'use client';

import type {
  ITrend,
  ITrendHashtag,
  ITrendPlaybook,
  ITrendSound,
  ITrendVideo,
} from '@cloud/interfaces';
import type { ICreatorWatchlist } from '@cloud/interfaces/analytics/creator-watchlist.interface';
import type { ITrendPlatformConfig } from '@cloud/interfaces/analytics/platform-config.interface';
import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { Platform, Timeframe } from '@genfeedai/enums';
import { createLocalStorageCache } from '@helpers/data/cache/cache.helper';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TrendItem } from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { TrendsService } from '@services/social/trends.service';
import {
  TrendingHashtags,
  TrendingSounds,
  ViralVideoLeaderboard,
} from '@ui/analytics/trends';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineFire,
  HiOutlineHashtag,
  HiOutlineMusicalNote,
} from 'react-icons/hi2';

const TRENDS_PLATFORMS: ITrendPlatformConfig[] = [
  PLATFORM_CONFIGS.tiktok,
  PLATFORM_CONFIGS.youtube,
  PLATFORM_CONFIGS.instagram,
  PLATFORM_CONFIGS.twitter,
  PLATFORM_CONFIGS.reddit,
  PLATFORM_CONFIGS.pinterest,
];

const PLATFORM_CONFIG_LOOKUP = PLATFORM_CONFIGS;

const TRENDS_CACHE_TTL = 30 * 60 * 1000;
const trendsCache = createLocalStorageCache({ prefix: 'trends:' });

function getGrowthRateClass(rate: number): string {
  if (rate > 0) {
    return 'text-success';
  }
  if (rate < 0) {
    return 'text-error';
  }
  return '';
}

function getViralityBadgeClass(score: number): string {
  if (score >= 70) {
    return 'bg-primary text-primary-foreground';
  }
  if (score >= 40) {
    return 'bg-secondary text-secondary-foreground';
  }
  return 'bg-muted text-muted-foreground';
}

export default function AnalyticsTrends() {
  const router = useRouter();
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
  }, [brandId, getTrendsService]);

  useEffect(() => {
    const controller = new AbortController();

    const findTrends = async () => {
      const url = 'GET /trends';

      try {
        const service = await getTrendsService();
        if (controller.signal.aborted) {
          return;
        }
        const data = await service.getTrendingTopics();
        if (controller.signal.aborted) {
          return;
        }

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
  }, [brandId, getTrendsService]);

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

  // Handle video click - navigate to video URL or show details
  const handleVideoClick = useCallback((video: ITrendVideo) => {
    if (video.videoUrl) {
      window.open(video.videoUrl, '_blank');
    }
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

      const sortedTrends = [...trendsByPlatform].sort(
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

  return (
    <div className="space-y-8 pb-12">
      <header>
        <VStack gap={3}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="bg-info text-info-foreground text-xs uppercase tracking-wide">
              Live sync
            </Badge>

            {formattedLastSyncedAt && (
              <Text size="sm" color="subtle-60">
                Last updated {formattedLastSyncedAt}
              </Text>
            )}

            <Text size="sm" color="subtle-60">
              Tracking {viralVideos.length} standout videos across{' '}
              {TRENDS_PLATFORMS.length} platforms
            </Text>

            {leadingPlatform && leadingPlatform.totalMentions > 0 && (
              <Text size="sm" color="subtle-60">
                Highest term volume:{' '}
                <Text weight="semibold" color="default">
                  {leadingPlatform.label}
                </Text>{' '}
                ({formatCompactNumber(leadingPlatform.totalMentions)} mentions)
              </Text>
            )}
            <Text size="sm" color="subtle-60">
              {totalTrackedTopics} active keywords monitored
            </Text>
          </div>
          <Heading size="2xl" as="h1">
            Social Media Trends
          </Heading>
          <Text as="p" color="subtle-70" className="max-w-3xl">
            Monitor competitor hooks, creators, and viral moments so you can
            replicate the playbook for your next campaign.
          </Text>
        </VStack>
      </header>

      {/* Trending Topics Section */}
      <section>
        <Card
          className="border border-white/[0.08] bg-card/80 backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Topics"
          icon={HiOutlineFire}
        >
          <p className="text-sm text-foreground/60">
            Click on a trend to see detailed analytics and cross-platform data.
          </p>
          {isLoadingTrends ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-background" />
              ))}
            </div>
          ) : trendingTopics.length === 0 ? (
            <div className="text-center py-8 text-foreground/60">
              <HiOutlineFire className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No trending topics available.</p>
              <p className="text-sm mt-1">
                Connect your social accounts to see personalized trends.
              </p>
            </div>
          ) : (
            <Table<TrendItem>
              items={trendingTopics.slice(0, 20)}
              getRowKey={(item) => item.id}
              onRowClick={(item) => router.push(`/research/${item.id}`)}
              columns={[
                {
                  className: 'min-w-32',
                  header: 'Platform',
                  key: 'platform',
                  render: (item) => {
                    const config = PLATFORM_CONFIG_LOOKUP[item.platform];
                    const Icon = config?.icon;
                    return (
                      <div className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className="h-4 w-4"
                            style={{ color: config?.color }}
                          />
                        )}
                        <span className="font-medium">
                          {config?.label || item.platform}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  className: 'min-w-48',
                  header: 'Topic',
                  key: 'topic',
                  render: (item) => (
                    <span className="font-semibold text-foreground">
                      {item.topic}
                    </span>
                  ),
                },
                {
                  className: 'min-w-24',
                  header: 'Mentions',
                  key: 'mentions',
                  render: (item) => (
                    <span className="font-medium">
                      {formatCompactNumber(item.mentions)}
                    </span>
                  ),
                },
                {
                  className: 'min-w-20',
                  header: 'Growth',
                  key: 'growthRate',
                  render: (item) => (
                    <span
                      className={`font-medium ${getGrowthRateClass(item.growthRate)}`}
                    >
                      {item.growthRate > 0 ? '+' : ''}
                      {item.growthRate}%
                    </span>
                  ),
                },
                {
                  className: 'min-w-20',
                  header: 'Virality',
                  key: 'viralityScore',
                  render: (item) => (
                    <Badge
                      value={item.viralityScore}
                      className={`text-xs ${getViralityBadgeClass(item.viralityScore)}`}
                    />
                  ),
                },
              ]}
            />
          )}
        </Card>
      </section>

      {/* Viral Video Leaderboard Section */}
      <section>
        <Card
          className="border border-white/[0.08] bg-card/80 backdrop-blur"
          bodyClassName="space-y-6"
        >
          <ViralVideoLeaderboard
            videos={viralVideos}
            isLoading={isLoadingVideos}
            timeframe={videoTimeframe}
            onTimeframeChange={setVideoTimeframe}
            onVideoClick={handleVideoClick}
          />
        </Card>
      </section>

      {/* Trending Hashtags Section */}
      <section>
        <Card
          className="border border-white/[0.08] bg-card/80 backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Hashtags"
          icon={HiOutlineHashtag}
        >
          <TrendingHashtags
            hashtags={trendingHashtags}
            isLoading={isLoadingHashtags}
            selectedPlatform={hashtagPlatform}
            onPlatformChange={setHashtagPlatform}
            onHashtagClick={handleHashtagClick}
          />
        </Card>
      </section>

      {/* Trending Sounds Section */}
      <section>
        <Card
          className="border border-white/[0.08] bg-card/80 backdrop-blur"
          bodyClassName="space-y-6"
          label="Trending Sounds"
          icon={HiOutlineMusicalNote}
        >
          <TrendingSounds
            sounds={trendingSounds}
            isLoading={isLoadingSounds}
            onSoundClick={handleSoundClick}
          />
        </Card>
      </section>

      {(viralLeaderboard.length > 0 || creatorLeaderboard.length > 0) && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {viralLeaderboard.length > 0 && (
            <Card
              className="xl:col-span-2 border border-white/[0.08] bg-card/80 backdrop-blur"
              bodyClassName="space-y-6"
            >
              <VStack gap={2}>
                <Heading size="xl">Cross-Platform Leaderboard</Heading>
                <Text as="p" size="sm" color="subtle-60">
                  Top viral content across all platforms in the last 72 hours.
                </Text>
              </VStack>
              <Table<ITrendVideo>
                items={viralLeaderboard}
                columns={[
                  {
                    className: 'w-10',
                    header: '#',
                    key: 'rank',
                    render: (video) => (
                      <span className="font-semibold text-foreground/70">
                        {viralLeaderboard.findIndex(
                          (entry: ITrendVideo) => entry.id === video.id,
                        ) + 1}
                      </span>
                    ),
                  },
                  {
                    className: 'min-w-56',
                    header: 'Video',
                    key: 'title',
                    render: (video) => (
                      <div className="flex flex-col gap-2">
                        <span className="font-semibold text-foreground">
                          {video.title || video.hook || 'Untitled'}
                        </span>
                        <span className="text-xs text-foreground/60">
                          @{video.creatorHandle}
                          {video.publishedAt &&
                            ` - ${formatDate(video.publishedAt)}`}
                        </span>
                      </div>
                    ),
                  },
                  {
                    className: 'min-w-40',
                    header: 'Platform',
                    key: 'platform',
                    render: (video) => {
                      const platform = PLATFORM_CONFIG_LOOKUP[video.platform];
                      const Icon = platform?.icon;

                      return (
                        <div className="flex items-center gap-2">
                          {Icon && (
                            <span className="text-lg text-foreground/70">
                              <Icon />
                            </span>
                          )}
                          <span className="font-medium text-foreground">
                            {platform?.label ?? video.platform}
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    className: 'min-w-24',
                    header: 'Views',
                    key: 'views',
                    render: (video) => (
                      <span className="font-semibold text-foreground">
                        {formatCompactNumber(
                          video.views || video.viewCount || 0,
                        )}
                      </span>
                    ),
                  },
                  {
                    className: 'min-w-32',
                    header: 'Engagement',
                    key: 'engagementRate',
                    render: (video) => (
                      <span className="font-semibold text-foreground">
                        {(video.engagementRate || 0).toFixed(1)}%
                      </span>
                    ),
                  },
                  {
                    className: 'min-w-20 text-right',
                    header: 'Score',
                    key: 'viralScore',
                    render: (video) => {
                      const rank =
                        viralLeaderboard.findIndex(
                          (entry: ITrendVideo) => entry.id === video.id,
                        ) + 1;

                      const badgeTone =
                        rank <= 3
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground';

                      return (
                        <Badge
                          value={Math.round(video.viralScore || 0)}
                          className={`${badgeTone} text-xs`}
                        />
                      );
                    },
                  },
                ]}
                getRowKey={(video) => video.id || video.externalId || ''}
              />
            </Card>
          )}

          {creatorLeaderboard.length > 0 && (
            <Card
              className="border border-white/[0.08] bg-card/80 backdrop-blur"
              bodyClassName="space-y-6"
            >
              <VStack gap={2}>
                <Heading size="xl">Creator watchlist</Heading>
                <Text as="p" size="sm" color="subtle-60">
                  Fastest-growing creators to follow and benchmark this week.
                </Text>
              </VStack>
              <ul className="space-y-4">
                {creatorLeaderboard.map((brand: ICreatorWatchlist) => {
                  const platform = PLATFORM_CONFIG_LOOKUP[brand.platform];
                  const Icon = platform?.icon;

                  return (
                    <li
                      key={brand.id}
                      className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        {Icon && (
                          <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-background/60 text-base text-foreground/70">
                            <Icon />
                          </span>
                        )}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {brand.handle}
                            </span>
                            <Badge className="bg-transparent text-xs border border-white/[0.08] text-[10px] uppercase tracking-wide">
                              +{brand.growthRate}% 30d
                            </Badge>
                          </div>
                          <p className="text-xs text-foreground/60">
                            {brand.displayName} • {brand.contentPillar}
                          </p>
                          <p className="text-[11px] text-foreground/60">
                            Posting cadence: {brand.postingCadence}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-foreground/60">
                        <p className="font-semibold text-foreground">
                          {formatCompactNumber(brand.followers)} followers
                        </p>
                        <p className="font-semibold text-foreground">
                          {formatCompactNumber(brand.avgViews)} avg views
                        </p>
                        <p className="font-semibold text-foreground">
                          {brand.avgEngagementRate.toFixed(1)}% ER
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      )}

      {playbooks.length > 0 && (
        <section>
          <Card
            className="border border-white/[0.08] bg-card/80 backdrop-blur"
            bodyClassName="space-y-6"
          >
            <VStack gap={2}>
              <Heading size="xl">Viral format playbook</Heading>
              <Text as="p" size="sm" color="subtle-60">
                Repeatable storytelling patterns pulled from today&apos;s
                winning videos.
              </Text>
            </VStack>
            <ul className="space-y-4">
              {playbooks.map((pattern: ITrendPlaybook) => (
                <li
                  key={pattern.id}
                  className=" border border-white/[0.08] bg-card/70 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-foreground">
                        {pattern.title}
                      </h3>
                      <p className="text-sm text-foreground/60">
                        {pattern.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pattern.platforms.map((platformId: string) => {
                        const platform = PLATFORM_CONFIG_LOOKUP[platformId];

                        if (!platform) {
                          return null;
                        }

                        const Icon = platform.icon;

                        return (
                          <Badge
                            key={`${pattern.id}-${platformId}`}
                            className="bg-transparent text-xs border border-white/[0.08] text-[10px] uppercase tracking-wide"
                          >
                            <span className="flex items-center gap-2">
                              <Icon className="text-sm" />
                              {platform.label}
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-foreground/60">
                    Action: {pattern.action}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
