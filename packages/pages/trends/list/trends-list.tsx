'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES } from '@genfeedai/constants';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import type { ITrendVideo } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useTrendContent } from '@hooks/data/trends/use-trend-content/use-trend-content';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  useOptionalResearchWorkSurface,
  useResearchPagination,
  useResearchQueryState,
  useRestoreResearchFinding,
} from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import {
  type AuthorizedResearchFinding,
  isSameResearchFindingReference,
  toTrendContentFinding,
  toTrendVideoFinding,
} from '@pages/research/work-surface/research-work-surface.types';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import { TrendsService } from '@services/social/trends.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { EmptyStateCard } from '@ui/feedback';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { AtSign, Film, Link2, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { type ChangeEvent, type ReactNode, useMemo } from 'react';

function getVideoExternalId(video: ITrendVideo): string | null {
  if (video.externalId) {
    return video.externalId;
  }

  if (!video.videoUrl) {
    return null;
  }

  try {
    const url = new URL(video.videoUrl);
    const tiktokId = url.pathname.match(/\/video\/([^/?]+)/)?.[1];
    if (tiktokId) {
      return tiktokId;
    }

    if (url.hostname === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

function getVideoEmbedUrl(video: ITrendVideo): string | null {
  const externalId = getVideoExternalId(video);
  if (!externalId) {
    return null;
  }

  switch (video.platform.toLowerCase()) {
    case 'tiktok':
      return `https://www.tiktok.com/player/v1/${encodeURIComponent(externalId)}?autoplay=0&loop=0&muted=0`;
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}`;
    default:
      return null;
  }
}

function ViralVideoPreview({
  title,
  video,
}: {
  title: string;
  video: ITrendVideo;
}) {
  const embedUrl = getVideoEmbedUrl(video);

  if (embedUrl) {
    return (
      <iframe
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="size-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title={`${title} video`}
      />
    );
  }

  if (video.videoUrl) {
    return (
      <VideoPlayer
        ariaLabel={`${title} video`}
        className={'bg-black' /* design-system-allow-content-color */}
        src={video.videoUrl}
        thumbnail={video.thumbnailUrl}
        config={{
          autoPlay: false,
          controls: true,
          loop: false,
          muted: false,
          playsInline: true,
          preload: 'metadata',
        }}
      />
    );
  }

  return (
    <div className="flex size-full items-center justify-center bg-background-secondary text-foreground/35">
      <Film className="size-8" />
      <span className="sr-only">Video preview unavailable</span>
    </div>
  );
}

function ViralVideoCard({
  finding,
  isSelected,
  onSelect,
  video,
}: {
  finding: AuthorizedResearchFinding;
  isSelected: boolean;
  onSelect?: (finding: AuthorizedResearchFinding) => void;
  video: ITrendVideo;
}) {
  const title = video.title || video.hook || 'Untitled video';

  return (
    <Card bodyClassName="gap-0 p-0">
      <div
        className={
          'aspect-video overflow-hidden bg-black' /* design-system-allow-content-color */
        }
      >
        <ViralVideoPreview title={title} video={video} />
      </div>
      <div className="space-y-3 p-4">
        <div className="text-base font-semibold text-foreground">{title}</div>
        <div className="flex flex-wrap gap-2 text-xs text-foreground/55">
          <span className="capitalize">{video.platform}</span>
          {video.creatorHandle ? <span>@{video.creatorHandle}</span> : null}
          <span>Score {Math.round(video.viralScore)}</span>
        </div>
        {onSelect ? (
          <Button
            aria-pressed={isSelected}
            label={isSelected ? 'Selected for context' : 'Use as context'}
            onClick={() => onSelect(finding)}
            size={ButtonSize.SM}
            variant={isSelected ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
          />
        ) : null}
      </div>
    </Card>
  );
}

function SummaryMetricCards({
  summary,
  totalItems,
  videoCount,
}: {
  summary: TrendsSummary;
  totalItems: number;
  videoCount: number;
}) {
  return (
    <MetricCardGrid className="mb-5" columns={4}>
      <MetricCard
        label="Total posts"
        value={summary.totalItems ?? totalItems}
        description="Remix-ready posts in the saved discovery feed."
        size="sm"
      />
      <MetricCard
        label="Connected"
        value={summary.connectedPlatforms.length}
        description="Source platforms available for this brand."
        size="sm"
      />
      <MetricCard
        label="Trend topics"
        value={summary.totalTrends}
        description="Distinct topics matched against source content."
        size="sm"
      />
      <MetricCard
        label="Viral videos"
        value={videoCount}
        description="Adjacent video patterns available for remix work."
        size="sm"
      />
    </MetricCardGrid>
  );
}

function DiscoveryReadinessCards({ summary }: { summary: TrendsSummary }) {
  return (
    <MetricCardGrid className="mb-5" columns={3}>
      <MetricCard
        label="Source coverage"
        value={summary.connectedPlatforms.length}
        description="Platforms currently contributing source-post signals."
        size="sm"
      />
      <MetricCard
        label="Locked sources"
        value={summary.lockedPlatforms.length}
        description="Platforms waiting for access before they can add signals."
        size="sm"
      />
      <MetricCard
        label="Feed state"
        value={summary.totalItems ? 'Ready' : 'Waiting'}
        description="Discovery is populated from saved trend sync output."
        size="sm"
      />
    </MetricCardGrid>
  );
}

function SectionCardHeader({
  badge,
  description,
  icon,
  right,
  title,
}: {
  badge: string;
  description?: string;
  icon: ReactNode;
  right?: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <Badge variant="ghost">{badge}</Badge>
        </div>
        {description ? (
          <div className="text-sm leading-6 text-foreground/70">
            {description}
          </div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function TrendContentEmptyState({
  followingHref,
  isRefreshing,
  onRefresh,
  publishingHref,
  search,
  onClearSearch,
}: {
  followingHref: string;
  isRefreshing: boolean;
  onClearSearch: () => void;
  onRefresh: () => void;
  publishingHref: string;
  search: string;
}) {
  const hasSearch = Boolean(search.trim());

  if (hasSearch) {
    return (
      <EmptyStateCard
        icon={TrendingUp}
        title="No matching trend content"
        description="Nothing in your real discovery feed matches that search."
        action={{
          label: 'Clear search',
          onClick: onClearSearch,
        }}
      />
    );
  }

  return (
    <CardEmpty
      actions={
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link href={publishingHref}>
              <Link2 className="size-3.5" />
              Connect accounts
            </Link>
          </Button>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
            <Link href={followingHref}>
              <AtSign className="size-3.5" />
              Follow creators
            </Link>
          </Button>
          <Button
            isLoading={isRefreshing}
            label="Refresh"
            onClick={onRefresh}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </div>
      }
      description="Discovery stays empty until you connect publishing accounts or follow creators. No fake demo corpus — only signals you actually own."
      icon={TrendingUp}
      label="Warm this workspace with real sources"
    />
  );
}

function ViralVideosLoadingCards() {
  const labels = ['Hook pattern', 'Creator format', 'Remix angle'];

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {labels.map((label) => (
          <div key={label} className="bg-background/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="size-4 text-foreground/52" />
              {label}
            </div>
            <div className="mt-4 text-xs uppercase tracking-[0.18em] text-foreground/35">
              Loading
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-foreground/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ViralVideosEmptyState({
  isLoading,
  onRefresh,
}: {
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return <ViralVideosLoadingCards />;
  }

  return (
    <EmptyStateCard
      icon={Film}
      title="No viral videos yet"
      description="Breakout video patterns will surface here once trend syncs pull in videos adjacent to your saved feed."
      action={{
        label: 'Refresh videos',
        onClick: onRefresh,
      }}
    />
  );
}

export default function TrendsList() {
  const brandId = useBrandId();
  const { orgHref } = useOrgUrl();
  const surface = useOptionalResearchWorkSurface();
  const [search, setSearch] = useResearchQueryState();
  const followingHref = orgHref(APP_ROUTES.DISCOVERY.FOLLOWING);
  const publishingHref = orgHref(APP_ROUTES.SETTINGS.PUBLISHING);
  const {
    error,
    isLoading,
    isRefreshing,
    items,
    refreshTrendContent,
    summary,
  } = useTrendContent();

  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const {
    data: viralVideos = [],
    error: videosError,
    isLoading: isLoadingVideos,
    refetch: refetchVideos,
  } = useQuery<ITrendVideo[]>({
    queryFn: async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: 6 });
    },
    queryKey: ['trends-list-viral-videos', brandId],
  });

  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return items;
    }

    const query = search.toLowerCase();
    return items.filter((item) =>
      [
        item.authorHandle,
        item.platform,
        item.text,
        item.title,
        item.trendTopic,
        ...item.matchedTrends,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [items, search]);
  const findings = useMemo(
    () => [
      ...filteredItems.map(toTrendContentFinding),
      ...viralVideos.map(toTrendVideoFinding),
    ],
    [filteredItems, viralVideos],
  );
  const { pageItems, pagination } = useResearchPagination(filteredItems);
  const currentError = error || videosError;

  useRestoreResearchFinding(
    findings,
    isLoading || isLoadingVideos || Boolean(currentError),
  );

  const handleRefresh = async () => {
    await Promise.all([refreshTrendContent(), refetchVideos()]);
  };

  return (
    <>
      <SectionTopbar
        title="Trending Content"
        subtitle="Actual posts and videos trending across platforms, ready to remix."
        icon={TrendingUp}
        actions={
          <>
            <div className="w-44 sm:w-56">
              <FormSearchbar
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                onClear={() => setSearch('')}
                placeholder="Search trending content"
                size={ComponentSize.SM}
                className="w-full"
                inputClassName="h-8"
              />
            </div>
            <Badge variant="ghost">
              {isLoading
                ? 'Loading'
                : `${filteredItems.length} remixable items`}
            </Badge>
            <ButtonRefresh
              isRefreshing={isRefreshing}
              onClick={handleRefresh}
            />
          </>
        }
      />

      <Container>
        {!isLoading && !currentError ? (
          <SummaryMetricCards
            summary={summary}
            totalItems={items.length}
            videoCount={viralVideos.length}
          />
        ) : null}

        {currentError && !isLoading ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-medium">
                  Failed to load the content feed
                </div>
                <div className="text-xs text-foreground/70">
                  Retry to fetch the latest precomputed trend content.
                </div>
              </div>
              <Button
                label="Retry"
                onClick={() => {
                  handleRefresh().catch(() => {
                    /* surfaced via hook */
                  });
                }}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {!isLoading && !currentError && items.length === 0 ? (
          <DiscoveryReadinessCards summary={summary} />
        ) : null}

        {isLoading ? (
          <div className="py-8 text-sm text-foreground/40">
            Loading content feed…
          </div>
        ) : null}

        {!isLoading && !currentError ? (
          <div className="space-y-5">
            <section className="space-y-4">
              <SectionCardHeader
                title="Trending Content Feed"
                badge="Content-first"
                icon={<TrendingUp className="size-5 text-foreground/70" />}
              />

              {filteredItems.length === 0 ? (
                <TrendContentEmptyState
                  followingHref={followingHref}
                  isRefreshing={isRefreshing}
                  onClearSearch={() => setSearch('')}
                  onRefresh={() => {
                    handleRefresh().catch(() => {
                      /* surfaced via hook */
                    });
                  }}
                  publishingHref={publishingHref}
                  search={search}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {pageItems.map((item) => {
                    const finding = toTrendContentFinding(item);
                    return (
                      <TrendContentCard
                        key={item.id}
                        finding={finding}
                        isSelected={isSameResearchFindingReference(
                          surface?.authorizedFinding?.reference ?? null,
                          finding.reference,
                        )}
                        item={item}
                        onSelect={
                          surface?.isEmbedded
                            ? surface.selectFinding
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
              {pagination ? <div className="pt-2">{pagination}</div> : null}
            </section>

            <section className="space-y-4">
              <SectionCardHeader
                title="Viral Videos"
                badge="Cross-platform"
                description="Breakout video patterns adjacent to the saved trend feed."
                icon={<Film className="size-5 text-foreground/70" />}
                right={
                  <Badge variant={isLoadingVideos ? 'ghost' : 'info'}>
                    {isLoadingVideos
                      ? 'Loading'
                      : `${viralVideos.length} videos`}
                  </Badge>
                }
              />

              {viralVideos.length === 0 ? (
                <ViralVideosEmptyState
                  isLoading={isLoadingVideos}
                  onRefresh={() => {
                    void refetchVideos();
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {viralVideos.map((video: ITrendVideo) => {
                    const finding = toTrendVideoFinding(video);
                    return (
                      <ViralVideoCard
                        key={video.id || video.externalId || video.videoUrl}
                        finding={finding}
                        isSelected={isSameResearchFindingReference(
                          surface?.authorizedFinding?.reference ?? null,
                          finding.reference,
                        )}
                        onSelect={
                          surface?.isEmbedded
                            ? surface.selectFinding
                            : undefined
                        }
                        video={video}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </Container>
    </>
  );
}
