'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import type { ITrendVideo } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useTrendContent } from '@hooks/data/trends/use-trend-content/use-trend-content';
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import { TrendsService } from '@services/social/trends.service';
import Button from '@ui/buttons/base/Button';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';
import Container from '@ui/layout/container/Container';
import { type ChangeEvent, useMemo, useState } from 'react';
import { HiOutlineArrowTrendingUp, HiOutlineFilm } from 'react-icons/hi2';

function ViralVideoCard({ video }: { video: ITrendVideo }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-background/80 p-4">
      <div className="space-y-2">
        <div className="text-base font-semibold text-foreground">
          {video.title || video.hook || 'Untitled'}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-foreground/55">
          <span className="capitalize">{video.platform}</span>
          {video.creatorHandle ? <span>@{video.creatorHandle}</span> : null}
          <span>Score {Math.round(video.viralScore)}</span>
        </div>
      </div>
    </div>
  );
}

export default function TrendsList() {
  const brandId = useBrandId();
  const [search, setSearch] = useState('');
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
    data: viralVideos,
    error: videosError,
    isLoading: isLoadingVideos,
    refresh: refreshVideos,
  } = useResource<ITrendVideo[]>(
    async () => {
      const service = await getTrendsService();
      return service.getViralVideos({ limit: 6 });
    },
    {
      defaultValue: [],
      dependencies: [brandId],
    },
  );

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

  const handleRefresh = async () => {
    await Promise.all([refreshTrendContent(), refreshVideos()]);
  };

  const currentError = error || videosError;

  return (
    <Container
      description="Actual posts and videos trending across platforms, ready to remix."
      icon={HiOutlineArrowTrendingUp}
      label="Trending Content"
      right={
        <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
      }
    >
      <div className="mb-6">
        <SocialsNavigation active="overview" />
      </div>

      {!isLoading && !currentError ? (
        <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
              Total Posts
            </span>
            <span className="text-lg font-semibold text-foreground">
              {summary.totalItems ?? items.length}
            </span>
          </div>
          <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
              Connected
            </span>
            <span className="text-lg font-semibold text-foreground">
              {summary.connectedPlatforms.length}
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
        </div>
      ) : null}

      {currentError && !isLoading ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">Failed to load the content feed</div>
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
              variant={ButtonVariant.OUTLINE}
            />
          </div>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <FormSearchbar
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setSearch(event.target.value)
            }
            onClear={() => setSearch('')}
            placeholder="Search trending content"
          />
        </div>
        <Badge variant="ghost">
          {isLoading ? 'Loading' : `${filteredItems.length} remixable items`}
        </Badge>
      </div>

      {isLoading ? (
        <div className="py-8 text-sm text-foreground/40">
          Loading content feed...
        </div>
      ) : null}

      {!isLoading && !currentError ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <HiOutlineArrowTrendingUp className="h-5 w-5 text-foreground/70" />
              <h2 className="text-lg font-semibold text-foreground">
                Trending Content Feed
              </h2>
              <Badge variant="ghost">Content-first</Badge>
            </div>

            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-foreground/40">
                {search.trim()
                  ? 'No trending content matches your search.'
                  : 'No remixable trend content is available right now.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((item) => (
                  <TrendContentCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <HiOutlineFilm className="h-5 w-5 text-foreground/70" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Viral Videos
                  </h2>
                  <Badge variant="ghost">Cross-platform</Badge>
                </div>
                <div className="text-sm text-foreground/55">
                  Breakout video patterns adjacent to the saved trend feed.
                </div>
              </div>

              <Badge variant={isLoadingVideos ? 'ghost' : 'info'}>
                {isLoadingVideos ? 'Loading' : `${viralVideos.length} videos`}
              </Badge>
            </div>

            {viralVideos.length === 0 ? (
              <div className="py-3 text-sm text-foreground/40">
                No viral videos available right now.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {viralVideos.map((video) => (
                  <ViralVideoCard key={video.id} video={video} />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </Container>
  );
}
