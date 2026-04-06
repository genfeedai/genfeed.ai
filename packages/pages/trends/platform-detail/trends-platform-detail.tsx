'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonVariant, Platform } from '@genfeedai/enums';
import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useTrendContent } from '@hooks/data/trends/use-trend-content/use-trend-content';
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import {
  getTrendPlatformLabel,
  PLATFORM_RELATED_CONTENT,
  type TrendPlatform,
} from '@pages/trends/shared/trends-platforms';
import { TrendsService } from '@services/social/trends.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import { useMemo } from 'react';
import {
  HiHashtag,
  HiMusicalNote,
  HiOutlineArrowTrendingUp,
  HiOutlineFilm,
} from 'react-icons/hi2';

function RelatedMetricCard({
  badgeValue,
  detail,
  title,
}: {
  badgeValue: number;
  detail?: string | null;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/80 p-4">
      <div className="space-y-2">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
          <Badge variant="ghost">{Math.round(badgeValue)}</Badge>
          {detail ? <span>{detail}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default function TrendsPlatformDetail({
  platform,
}: {
  platform: TrendPlatform;
}) {
  const brandId = useBrandId();
  const label = getTrendPlatformLabel(platform);
  const relatedContent = PLATFORM_RELATED_CONTENT[platform];
  const unsupportedContentFeed = ![
    Platform.TWITTER,
    Platform.INSTAGRAM,
    Platform.TIKTOK,
    Platform.YOUTUBE,
    Platform.REDDIT,
  ].includes(platform as Platform);

  const {
    error,
    isLoading,
    isRefreshing,
    items,
    refreshTrendContent,
    summary,
  } = useTrendContent(platform);

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const {
    data: viralVideos,
    isLoading: isLoadingVideos,
    refresh: refreshVideos,
  } = useResource<ITrendVideo[]>(
    async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: 12, platform });
    },
    {
      defaultValue: [],
      dependencies: [brandId, platform, relatedContent.videos],
      enabled: relatedContent.videos,
    },
  );

  const {
    data: hashtags,
    isLoading: isLoadingHashtags,
    refresh: refreshHashtags,
  } = useResource<ITrendHashtag[]>(
    async () => {
      const service = await getTrendsService();
      return service.getTrendingHashtags({ limit: 12, platform });
    },
    {
      defaultValue: [],
      dependencies: [brandId, platform, relatedContent.hashtags],
      enabled: relatedContent.hashtags,
    },
  );

  const {
    data: sounds,
    isLoading: isLoadingSounds,
    refresh: refreshSounds,
  } = useResource<ITrendSound[]>(
    async () => {
      const service = await getTrendsService();
      return service.getTrendingSounds({ limit: 12 });
    },
    {
      defaultValue: [],
      dependencies: [brandId, platform, relatedContent.sounds],
      enabled: relatedContent.sounds,
    },
  );

  const feedModeLabel = useMemo(() => {
    if (platform === Platform.LINKEDIN) {
      return 'Curated';
    }

    if (unsupportedContentFeed) {
      return 'Metadata only';
    }

    return 'Saved daily feed';
  }, [platform, unsupportedContentFeed]);

  const handleRefresh = async () => {
    await refreshTrendContent();

    const refreshJobs: Array<Promise<unknown>> = [];
    if (relatedContent.videos) {
      refreshJobs.push(refreshVideos());
    }
    if (relatedContent.hashtags) {
      refreshJobs.push(refreshHashtags());
    }
    if (relatedContent.sounds) {
      refreshJobs.push(refreshSounds());
    }

    await Promise.all(refreshJobs);
  };

  return (
    <Container
      description="Platform-specific trending posts and videos, with related signal sets below."
      icon={HiOutlineArrowTrendingUp}
      label={`${label} Trends`}
      right={
        <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
      }
    >
      <div className="mb-6">
        <SocialsNavigation active={platform} />
      </div>

      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Feed Type
          </span>
          <span className="text-lg font-semibold text-foreground">
            {feedModeLabel}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Trend Topics
          </span>
          <span className="text-lg font-semibold text-foreground">
            {summary.totalTrends}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Source Items
          </span>
          <span className="text-lg font-semibold text-foreground">
            {summary.totalItems ?? items.length}
          </span>
        </div>
      </div>

      {platform === Platform.LINKEDIN ? (
        <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-foreground/65">
          LinkedIn topics are curated because LinkedIn does not provide a public
          trends API.
        </div>
      ) : null}

      {unsupportedContentFeed && platform !== Platform.LINKEDIN ? (
        <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-foreground/65">
          No public source-post feed is available for this platform yet. We only
          show adjacent trend metadata for now.
        </div>
      ) : null}

      {error && !isLoading ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">Failed to load platform content</div>
              <div className="text-xs text-foreground/70">
                Retry to fetch the latest saved trend feed.
              </div>
            </div>
            <Button
              label="Retry"
              onClick={() => {
                handleRefresh().catch(() => {
                  /* surfaced via hook */
                });
              }}
              variant={ButtonVariant.OUTLINE}
            />
          </div>
        </Alert>
      ) : null}

      {!error ? (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <HiOutlineArrowTrendingUp className="h-5 w-5 text-foreground/70" />
              <h2 className="text-lg font-semibold text-foreground">
                {label} content feed
              </h2>
              <Badge variant="ghost">Remix-ready</Badge>
            </div>

            {unsupportedContentFeed ? (
              <div className="py-3 text-sm text-foreground/40">
                No public content feed available for this platform right now.
              </div>
            ) : isLoading ? (
              <div className="py-3 text-sm text-foreground/40">
                Loading content feed...
              </div>
            ) : items.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {items.map((item) => (
                  <TrendContentCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div className="py-3 text-sm text-foreground/40">
                No remixable source posts are available for this platform right
                now.
              </div>
            )}
          </section>

          {relatedContent.videos ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <HiOutlineFilm className="h-5 w-5 text-foreground/70" />
                <h2 className="text-lg font-semibold text-foreground">
                  Related viral videos
                </h2>
              </div>
              {isLoadingVideos ? (
                <div className="py-3 text-sm text-foreground/40">
                  Loading viral videos...
                </div>
              ) : viralVideos.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {viralVideos.map((video) => (
                    <RelatedMetricCard
                      badgeValue={video.viralScore}
                      detail={
                        video.creatorHandle ? `@${video.creatorHandle}` : null
                      }
                      key={video.id}
                      title={video.title || video.hook || 'Untitled'}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-3 text-sm text-foreground/40">
                  No viral videos available right now.
                </div>
              )}
            </section>
          ) : null}

          {relatedContent.hashtags ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <HiHashtag className="h-5 w-5 text-foreground/70" />
                <h2 className="text-lg font-semibold text-foreground">
                  Trending hashtags
                </h2>
              </div>
              {isLoadingHashtags ? (
                <div className="py-3 text-sm text-foreground/40">
                  Loading hashtags...
                </div>
              ) : hashtags.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {hashtags.map((hashtag) => (
                    <RelatedMetricCard
                      badgeValue={hashtag.viralityScore}
                      detail={
                        hashtag.platform ? hashtag.platform.toLowerCase() : null
                      }
                      key={hashtag.id || hashtag.hashtag}
                      title={hashtag.hashtag}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-3 text-sm text-foreground/40">
                  No trending hashtags available right now.
                </div>
              )}
            </section>
          ) : null}

          {relatedContent.sounds ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <HiMusicalNote className="h-5 w-5 text-foreground/70" />
                <h2 className="text-lg font-semibold text-foreground">
                  Trending sounds
                </h2>
              </div>
              {isLoadingSounds ? (
                <div className="py-3 text-sm text-foreground/40">
                  Loading sounds...
                </div>
              ) : sounds.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {sounds.map((sound) => (
                    <RelatedMetricCard
                      badgeValue={sound.viralityScore}
                      detail={
                        sound.platform ? sound.platform.toLowerCase() : null
                      }
                      key={sound.soundId}
                      title={sound.soundName || 'Untitled sound'}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-3 text-sm text-foreground/40">
                  No trending sounds available right now.
                </div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </Container>
  );
}
