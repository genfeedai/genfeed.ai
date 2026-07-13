'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ITrendVideo } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useTrendContent } from '@hooks/data/trends/use-trend-content/use-trend-content';
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
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import TrendContentCard from '@pages/trends/shared/trend-content-card';
import type { TrendsSummary } from '@props/trends/trends-page.props';
import { TrendsService } from '@services/social/trends.service';
import { useQuery } from '@tanstack/react-query';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { type ChangeEvent, type ReactNode, useMemo } from 'react';
import {
  HiOutlineArrowTrendingUp,
  HiOutlineFilm,
  HiOutlineInboxStack,
  HiOutlineSparkles,
} from 'react-icons/hi2';

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
  return (
    <Card bodyClassName="p-4">
      <div className="space-y-2">
        <div className="text-base font-semibold text-foreground">
          {video.title || video.hook || 'Untitled'}
        </div>
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

function SummaryMetricCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string | number;
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/62">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-foreground/68">{detail}</div>
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
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetricCard
        label="Total posts"
        value={summary.totalItems ?? totalItems}
        detail="Remix-ready posts in the saved discovery feed."
      />
      <SummaryMetricCard
        label="Connected"
        value={summary.connectedPlatforms.length}
        detail="Source platforms available for this brand."
      />
      <SummaryMetricCard
        label="Trend topics"
        value={summary.totalTrends}
        detail="Distinct topics matched against source content."
      />
      <SummaryMetricCard
        label="Viral videos"
        value={videoCount}
        detail="Adjacent video patterns available for remix work."
      />
    </div>
  );
}

function ReadinessCard({
  badge,
  description,
  label,
  value,
}: {
  badge: string;
  description: string;
  label: string;
  value: string | number;
}) {
  return (
    <Card bodyClassName="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs leading-5 text-foreground/68">
            {description}
          </div>
        </div>
        <Badge variant="ghost">{badge}</Badge>
      </div>
      <div className="mt-5 text-xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

function DiscoveryReadinessCards({ summary }: { summary: TrendsSummary }) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
      <ReadinessCard
        label="Source coverage"
        value={summary.connectedPlatforms.length}
        badge="Connected"
        description="Platforms currently contributing source-post signals."
      />
      <ReadinessCard
        label="Locked sources"
        value={summary.lockedPlatforms.length}
        badge="Needs auth"
        description="Platforms waiting for access before they can add signals."
      />
      <ReadinessCard
        label="Feed state"
        value={summary.totalItems ? 'Ready' : 'Waiting'}
        badge="Precomputed"
        description="Discovery is populated from saved trend sync output."
      />
    </div>
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

function TrendContentEmptyTable({
  isRefreshing,
  onAction,
  search,
}: {
  isRefreshing: boolean;
  onAction: () => void;
  search: string;
}) {
  const hasSearch = Boolean(search.trim());
  const headClassName =
    'px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/72';

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <Table className="w-full text-left">
        <TableHeader>
          <TableRow className="border-b border-border bg-background-secondary">
            <TableHead className={headClassName}>Source</TableHead>
            <TableHead className={headClassName}>Content</TableHead>
            <TableHead className={headClassName}>Trend</TableHead>
            <TableHead className={headClassName}>Score</TableHead>
            <TableHead className={headClassName}>Mentions</TableHead>
            <TableHead className={headClassName}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="px-4 py-12 text-foreground/70">
              <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground/70">
                  <HiOutlineInboxStack className="size-5" />
                </div>
                <div className="mt-4 text-base font-semibold text-foreground">
                  {hasSearch
                    ? 'No matching trend content'
                    : 'No remixable trend content yet'}
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/72">
                  {hasSearch
                    ? 'The current saved feed has no source posts matching that search.'
                    : 'The feed is waiting for source posts from trend syncs before it can show remix-ready rows.'}
                </div>
                <Button
                  label={hasSearch ? 'Clear search' : 'Refresh feed'}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  isLoading={!hasSearch && isRefreshing}
                  onClick={onAction}
                  className="mt-5"
                />
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function ViralVideosEmptyState({ isLoading }: { isLoading: boolean }) {
  const cards = [
    {
      label: 'Hook pattern',
      value: isLoading ? 'Loading' : 'Pending',
    },
    {
      label: 'Creator format',
      value: isLoading ? 'Loading' : 'Pending',
    },
    {
      label: 'Remix angle',
      value: isLoading ? 'Loading' : 'Pending',
    },
  ];

  return (
    <div className="overflow-hidden rounded-card border border-white/[0.06] bg-card">
      <div className="grid grid-cols-1 divide-y divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
        {cards.map((card) => (
          <div key={card.label} className="bg-background/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <HiOutlineSparkles className="size-4 text-foreground/52" />
              {card.label}
            </div>
            <div className="mt-4 text-xs uppercase tracking-[0.18em] text-foreground/35">
              {card.value}
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-white/[0.04]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrendsList() {
  const brandId = useBrandId();
  const surface = useOptionalResearchWorkSurface();
  const [search, setSearch] = useResearchQueryState();
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
        icon={HiOutlineArrowTrendingUp}
        actions={
          <ButtonRefresh isRefreshing={isRefreshing} onClick={handleRefresh} />
        }
        tabs={<SocialsNavigation active="overview" />}
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
                variant={ButtonVariant.OUTLINE}
              />
            </div>
          </Alert>
        ) : null}

        {!isLoading && !currentError && items.length === 0 ? (
          <DiscoveryReadinessCards summary={summary} />
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
            Loading content feed…
          </div>
        ) : null}

        {!isLoading && !currentError ? (
          <div className="space-y-5">
            <section className="space-y-4">
              <SectionCardHeader
                title="Trending Content Feed"
                badge="Content-first"
                icon={
                  <HiOutlineArrowTrendingUp className="size-5 text-foreground/70" />
                }
              />

              {filteredItems.length === 0 ? (
                <TrendContentEmptyTable
                  isRefreshing={isRefreshing}
                  search={search}
                  onAction={() => {
                    if (search.trim()) {
                      setSearch('');
                      return;
                    }

                    handleRefresh().catch(() => {
                      /* surfaced via hook */
                    });
                  }}
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
                icon={<HiOutlineFilm className="size-5 text-foreground/70" />}
                right={
                  <Badge variant={isLoadingVideos ? 'ghost' : 'info'}>
                    {isLoadingVideos
                      ? 'Loading'
                      : `${viralVideos.length} videos`}
                  </Badge>
                }
              />

              {viralVideos.length === 0 ? (
                <ViralVideosEmptyState isLoading={isLoadingVideos} />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {viralVideos.map((video: ITrendVideo) => {
                    const finding = toTrendVideoFinding(video);
                    return (
                      <ViralVideoCard
                        key={video.id}
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
