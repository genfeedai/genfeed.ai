'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonVariant, Platform } from '@genfeedai/enums';
import type {
  ITrendHashtag,
  ITrendSound,
  ITrendVideo,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useTrendContent } from '@hooks/data/trends/use-trend-content/use-trend-content';
import {
  SocialsNavigation,
  type SocialsNavigationBasePath,
} from '@pages/trends/shared/socials-navigation';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import {
  getTrendPlatformLabel,
  PLATFORM_RELATED_CONTENT,
  type TrendPlatform,
} from '@pages/trends/shared/trends-platforms';
import { TrendsService } from '@services/social/trends.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';
import { HiOutlineArrowTrendingUp } from 'react-icons/hi2';
import TrendsPlatformRelatedSections from './components/trends-platform-related-sections';
import TrendsPlatformStatBar from './components/trends-platform-stat-bar';

export default function TrendsPlatformDetail({
  platform,
  basePath = '/research',
}: {
  platform: TrendPlatform;
  basePath?: SocialsNavigationBasePath;
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
    data: viralVideos = [],
    isLoading: isLoadingVideos,
    refetch: refetchVideos,
  } = useQuery<ITrendVideo[]>({
    enabled: relatedContent.videos,
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: 12, platform });
    },
    queryKey: [
      'trends-platform-viral-videos',
      brandId,
      platform,
      relatedContent.videos,
    ],
  });

  const {
    data: hashtags = [],
    isLoading: isLoadingHashtags,
    refetch: refetchHashtags,
  } = useQuery<ITrendHashtag[]>({
    enabled: relatedContent.hashtags,
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getTrendingHashtags({ limit: 12, platform });
    },
    queryKey: [
      'trends-platform-hashtags',
      brandId,
      platform,
      relatedContent.hashtags,
    ],
  });

  const {
    data: sounds = [],
    isLoading: isLoadingSounds,
    refetch: refetchSounds,
  } = useQuery<ITrendSound[]>({
    enabled: relatedContent.sounds,
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getTrendingSounds({ limit: 12 });
    },
    queryKey: [
      'trends-platform-sounds',
      brandId,
      platform,
      relatedContent.sounds,
    ],
  });

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
      refreshJobs.push(refetchVideos());
    }
    if (relatedContent.hashtags) {
      refreshJobs.push(refetchHashtags());
    }
    if (relatedContent.sounds) {
      refreshJobs.push(refetchSounds());
    }

    await Promise.all(refreshJobs);
  };

  return (
    <>
      <SectionTopbar
        title={`${label} Trends`}
        subtitle="Platform-specific trending posts and videos, with related signal sets below."
        icon={HiOutlineArrowTrendingUp}
        actions={
          <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
        }
        tabs={<SocialsNavigation active={platform} basePath={basePath} />}
      />

      <Container>
        <TrendsPlatformStatBar
          feedModeLabel={feedModeLabel}
          totalItems={summary.totalItems ?? items.length}
          totalTrends={summary.totalTrends}
        />

        {platform === Platform.LINKEDIN ? (
          <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-foreground/65">
            LinkedIn topics are curated because LinkedIn does not provide a
            public trends API.
          </div>
        ) : null}

        {unsupportedContentFeed && platform !== Platform.LINKEDIN ? (
          <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-foreground/65">
            No public source-post feed is available for this platform yet. We
            only show adjacent trend metadata for now.
          </div>
        ) : null}

        {error && !isLoading ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">
                  Failed to load platform content
                </div>
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
                <HiOutlineArrowTrendingUp className="size-5 text-foreground/70" />
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
                  Loading content feed…
                </div>
              ) : items.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {items.map((item) => (
                    <TrendContentCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="py-3 text-sm text-foreground/40">
                  No remixable source posts are available for this platform
                  right now.
                </div>
              )}
            </section>

            <TrendsPlatformRelatedSections
              hashtags={hashtags}
              isLoadingHashtags={isLoadingHashtags}
              isLoadingSounds={isLoadingSounds}
              isLoadingVideos={isLoadingVideos}
              showHashtags={relatedContent.hashtags}
              showSounds={relatedContent.sounds}
              showVideos={relatedContent.videos}
              sounds={sounds}
              viralVideos={viralVideos}
            />
          </div>
        ) : null}
      </Container>
    </>
  );
}
