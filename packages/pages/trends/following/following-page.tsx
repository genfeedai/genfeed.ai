'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  SocialSourcePlatform,
  SocialSourceType,
  SourcePostActionType,
} from '@genfeedai/enums';
import type {
  ISocialSource,
  ISourcePost,
  SocialSourcesResponse,
} from '@genfeedai/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isBrandResourceReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import {
  useOptionalResearchWorkSurface,
  useResearchPagination,
  useResearchQueryState,
  useResearchSearchParamState,
  useRestoreResearchFinding,
} from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import {
  type AuthorizedResearchFinding,
  isSameResearchFindingReference,
  toSourcePostFinding,
} from '@pages/research/work-surface/research-work-surface.types';
import FollowSourceModal from '@pages/trends/following/FollowSourceModal';
import type {
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import { SourcePostsService } from '@services/social/source-posts.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import LoadingState from '@ui/feedback/LoadingState';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  buildSourcePostVariationsHref,
  buildTrendSourceAgentHref,
} from '@utils/url/desktop-loop-url.util';
import {
  AtSign,
  Ellipsis,
  ExternalLink,
  Inbox,
  List,
  MessageSquare,
  Plus,
  RefreshCw,
  Repeat2,
  Send,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useCallback, useMemo, useState } from 'react';

const EMPTY_FEED: SocialSourcesResponse = {
  posts: [],
  sources: [],
  summary: {
    activeSources: 0,
    totalPosts: 0,
    totalSources: 0,
  },
};

const PLATFORM_OPTIONS = [
  { label: 'X', value: SocialSourcePlatform.TWITTER },
  { label: 'Instagram', value: SocialSourcePlatform.INSTAGRAM },
  { label: 'TikTok', value: SocialSourcePlatform.TIKTOK },
];

const PREFILLED_SOURCE_POST_REMIX_PLATFORMS = new Set<string>([
  SocialSourcePlatform.INSTAGRAM,
  SocialSourcePlatform.TIKTOK,
  'youtube',
]);

export default function FollowingPage() {
  const translate = useTranslations('common.following');
  const collectionScope = useCollectionScope();
  const { brandId } = collectionScope;
  const isBrandReady = isBrandResourceReady(collectionScope);
  const surface = useOptionalResearchWorkSurface();
  const remixSurface = useOptionalDiscoveryRemix();
  const router = useRouter();
  const { href } = useOrgUrl();
  const queryClient = useQueryClient();
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [platform, setPlatform] = useResearchSearchParamState<string>({
    allowedValues: ['all', ...PLATFORM_OPTIONS.map((option) => option.value)],
    defaultValue: 'all',
    key: 'platform',
  });
  const [search, setSearch] = useResearchQueryState();
  const [isFollowOpen, setIsFollowOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );
  const getSourcePostsService = useAuthedService((token: string) =>
    SourcePostsService.getInstance(token),
  );

  const queryKey = ['social-sources-feed', brandId, platform, debouncedSearch];
  const {
    data = EMPTY_FEED,
    isError,
    isFetching,
    refetch,
  } = useQuery<SocialSourcesResponse>({
    enabled: isBrandReady,
    initialData: EMPTY_FEED,
    queryFn: async () => {
      const service = await getSocialSourcesService();
      return service.getFollowingFeed({
        brandId,
        platform: platform === 'all' ? undefined : platform,
        postsLimit: 50,
        search: debouncedSearch.trim() || undefined,
      });
    },
    queryKey,
  });
  const isInitialFetch =
    isFetching && data.posts.length === 0 && data.sources.length === 0;
  const hasSources = data.sources.length > 0;
  const hasPosts = data.posts.length > 0;
  const findings = useMemo(
    () => data.posts.map(toSourcePostFinding),
    [data.posts],
  );
  const { pageItems, pagination } = useResearchPagination(data.posts);

  useRestoreResearchFinding(findings, isInitialFetch || isError);

  const refreshFeed = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['social-sources-feed'] });
    await refetch();
  }, [queryClient, refetch]);

  const syncAll = useCallback(async () => {
    try {
      setBusyId('sync-all');
      const service = await getSocialSourcesService();
      const result = await service.syncBrand({ brandId, limit: 25 });
      if (result.failures?.length) {
        notifications.error(
          `${result.failures.length} source${result.failures.length === 1 ? '' : 's'} failed to sync`,
        );
      }
      if (result.count > 0) {
        notifications.success(
          result.count === 1 ? 'Synced 1 post' : `Synced ${result.count} posts`,
        );
      } else if (!result.failures?.length) {
        notifications.error(
          'Sync finished with 0 posts — check X API / Apify configuration',
        );
      }
      await refreshFeed();
    } catch (error) {
      logger.error('Failed to sync sources', error);
      notifications.error(
        (error as Error)?.message || 'Failed to sync sources',
      );
    } finally {
      setBusyId(null);
    }
  }, [brandId, getSocialSourcesService, notifications, refreshFeed]);

  const syncSource = useCallback(
    async (sourceId: string) => {
      try {
        setBusyId(sourceId);
        const service = await getSocialSourcesService();
        const result = await service.syncSource(sourceId, {
          brandId,
          limit: 25,
        });
        if (result.count > 0) {
          notifications.success(
            result.count === 1
              ? 'Synced 1 post'
              : `Synced ${result.count} posts`,
          );
        } else {
          notifications.error(
            'Sync finished with 0 posts — timeline may be empty or the collector failed silently before; check last sync error in Manage sources',
          );
        }
        await refreshFeed();
      } catch (error) {
        logger.error('Failed to sync source', error);
        notifications.error(
          (error as Error)?.message || 'Failed to sync source',
        );
      } finally {
        setBusyId(null);
      }
    },
    [brandId, getSocialSourcesService, notifications, refreshFeed],
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      try {
        setBusyId(sourceId);
        const service = await getSocialSourcesService();
        await service.delete(sourceId);
        notifications.success('Source removed');
        await refreshFeed();
      } catch (error) {
        logger.error('Failed to remove source', error);
        notifications.error('Failed to remove source');
      } finally {
        setBusyId(null);
      }
    },
    [getSocialSourcesService, notifications, refreshFeed],
  );

  const createDraft = useCallback(
    async (post: ISourcePost, actionType: SourcePostActionType) => {
      try {
        setBusyId(`${post.id}-${actionType}`);
        const service = await getSourcePostsService();
        await service.createDraft(
          post.id,
          {
            actionType,
          },
          { brandId },
        );
        notifications.success('Draft created');
      } catch (error) {
        logger.error('Failed to create source post draft', error);
        notifications.error('Failed to create draft');
      } finally {
        setBusyId(null);
      }
    },
    [brandId, getSourcePostsService, notifications],
  );

  const openAgent = useCallback(
    (post: ISourcePost) => {
      const { source, trend } = toTrendSource(post);
      router.push(buildTrendSourceAgentHref(trend, source));
    },
    [router],
  );

  const openRemix = useCallback(
    (post: ISourcePost) => {
      if (
        PREFILLED_SOURCE_POST_REMIX_PLATFORMS.has(post.platform) &&
        remixSurface
      ) {
        void remixSurface.openRemix({
          kind: 'source_post',
          sourcePostId: post.id,
        });
        return;
      }

      router.push(
        href(
          buildSourcePostVariationsHref({
            platform: post.platform,
            sourcePostId: post.id,
          }),
        ),
      );
    },
    [href, remixSurface, router],
  );

  const openFollowModal = useCallback(() => {
    setIsFollowOpen(true);
  }, []);

  const feedSummaryLabel = hasSources
    ? `${data.summary.totalPosts} posts · ${data.summary.activeSources} active of ${data.summary.totalSources} sources`
    : 'Follow accounts once — see every platform here';

  return (
    <>
      <SectionTopbar
        title="Following"
        subtitle={feedSummaryLabel}
        icon={Users}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {hasSources ? (
              <>
                <Button
                  icon={<List className="size-4" />}
                  label="Manage sources"
                  onClick={() => setIsManageOpen(true)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                />
                <Button
                  icon={<RefreshCw className="size-4" />}
                  isLoading={busyId === 'sync-all'}
                  label="Sync"
                  onClick={() => {
                    syncAll().catch(() => undefined);
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              </>
            ) : null}
            <Button
              icon={<Plus className="size-4" />}
              label="Follow source"
              onClick={openFollowModal}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          </div>
        }
      />

      <Container>
        {isError ? (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{translate('errors.load')}</span>
              <Button
                label="Retry"
                onClick={() => {
                  refetch().catch(() => undefined);
                }}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {isInitialFetch ? (
          <div className="min-h-64">
            <LoadingState isFullSize />
          </div>
        ) : null}

        {!isError && !isInitialFetch && !hasSources ? (
          <CardEmpty
            icon={AtSign}
            label="Follow sources for this brand"
            description="Collect posts from accounts across X, Instagram, and TikTok into one global feed — not buried under Socials platform tabs."
            actions={
              <Button
                icon={<Plus className="size-4" />}
                label="Follow source"
                onClick={openFollowModal}
                size={ButtonSize.SM}
                variant={ButtonVariant.DEFAULT}
              />
            }
          />
        ) : null}

        {!isError && !isInitialFetch && hasSources ? (
          <div className="space-y-5">
            {hasPosts || search || platform !== 'all' ? (
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="w-full md:max-w-md">
                  <FormSearchbar
                    value={search}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setSearch(event.target.value)
                    }
                    onClear={() => setSearch('')}
                    placeholder="Search followed posts"
                  />
                </div>
                {hasPosts || platform !== 'all' ? (
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="min-w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {translate('filters.allPlatforms')}
                      </SelectItem>
                      {PLATFORM_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            ) : null}

            {hasPosts ? (
              <>
                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {pageItems.map((post) => {
                    const finding = toSourcePostFinding(post);
                    return (
                      <SourcePostCard
                        key={post.id}
                        busyId={busyId}
                        finding={finding}
                        isSelected={isSameResearchFindingReference(
                          surface?.authorizedFinding?.reference ?? null,
                          finding.reference,
                        )}
                        post={post}
                        onCreateDraft={createDraft}
                        onOpenAgent={openAgent}
                        onOpenRemix={openRemix}
                        onSelect={
                          surface?.isEmbedded
                            ? surface.selectFinding
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
                {pagination ? <div>{pagination}</div> : null}
              </>
            ) : (
              <CardEmpty
                icon={Inbox}
                label="No collected posts yet"
                description={
                  data.sources.some(
                    (source) => source.lastSyncStatus === 'failed',
                  )
                    ? `Last sync failed: ${
                        data.sources.find(
                          (source) => source.lastSyncStatus === 'failed',
                        )?.lastSyncError || 'collector error'
                      }. Fix X API / Apify config and Sync again.`
                    : data.summary.lastSyncedAt
                      ? 'Sources are connected but no posts were stored. Sync uses the official X API when configured, then Apify as fallback — check token env if this persists.'
                      : 'Sources are connected. Sync once to pull recent posts into this feed.'
                }
                actions={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      icon={<RefreshCw className="size-4" />}
                      isLoading={busyId === 'sync-all'}
                      label="Sync sources"
                      onClick={() => {
                        syncAll().catch(() => undefined);
                      }}
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                    />
                    <Button
                      icon={<List className="size-4" />}
                      label="Manage sources"
                      onClick={() => setIsManageOpen(true)}
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                    />
                  </div>
                }
              />
            )}
          </div>
        ) : null}
      </Container>

      <FollowSourceModal
        brandId={brandId ?? ''}
        existingSources={data.sources}
        open={isFollowOpen}
        onOpenChange={setIsFollowOpen}
        onFollowed={refreshFeed}
      />

      <Dialog open={isManageOpen} onOpenChange={setIsManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{translate('manage.title')}</DialogTitle>
            <DialogDescription>
              {translate('manage.summary', {
                active: data.summary.activeSources,
                total: data.summary.totalSources,
              })}
              {data.summary.lastSyncedAt
                ? ` · last sync ${getRelativeTime(data.summary.lastSyncedAt)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-card border border-border">
            {data.sources.length ? (
              data.sources.map((source) => (
                <SourceRow
                  key={source.id}
                  busyId={busyId}
                  source={source}
                  onRemove={removeSource}
                  onSync={syncSource}
                />
              ))
            ) : (
              <div className="p-5 text-sm text-foreground/62">
                {translate('manage.empty')}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              icon={<Plus className="size-4" />}
              label="Follow source"
              onClick={() => {
                setIsManageOpen(false);
                setIsFollowOpen(true);
              }}
              variant={ButtonVariant.SECONDARY}
            />
            <Button
              icon={<RefreshCw className="size-4" />}
              isLoading={busyId === 'sync-all'}
              label="Sync all"
              onClick={() => {
                syncAll().catch(() => undefined);
              }}
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SourceRow({
  busyId,
  onRemove,
  onSync,
  source,
}: {
  busyId: string | null;
  onRemove: (id: string) => Promise<void>;
  onSync: (id: string) => Promise<void>;
  source: ISocialSource;
}) {
  const translate = useTranslations('common.following');
  const isImportContainer = source.sourceType === SocialSourceType.POST;
  const syncStatus = source.lastSyncStatus ?? null;
  const statusLabel =
    syncStatus === 'failed'
      ? 'Failed'
      : syncStatus === 'empty'
        ? 'Empty'
        : syncStatus === 'success'
          ? 'OK'
          : null;
  const statusClass =
    syncStatus === 'failed'
      ? 'text-destructive'
      : syncStatus === 'empty'
        ? 'text-warning'
        : 'text-foreground/52';

  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {getPlatformIcon(source.platform, 'h-4 w-4')}
          <span className="truncate">
            @{source.handle || source.displayName || 'source'}
          </span>
          {isImportContainer ? (
            <Badge variant="ghost">{translate('manage.imported')}</Badge>
          ) : null}
          {statusLabel ? (
            <Badge
              variant={
                syncStatus === 'failed'
                  ? 'error'
                  : syncStatus === 'empty'
                    ? 'warning'
                    : 'secondary'
              }
            >
              {statusLabel}
            </Badge>
          ) : null}
        </div>
        <div className={`mt-1 text-xs ${statusClass}`}>
          {isImportContainer
            ? 'Imported posts — re-import a post URL to refresh metrics'
            : source.lastSyncedAt
              ? `Synced ${getRelativeTime(source.lastSyncedAt)}`
              : 'Never synced'}
        </div>
        {source.lastSyncError ? (
          <p className="mt-1 text-xs leading-5 text-foreground/55">
            {source.lastSyncError}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!isImportContainer ? (
          <Button
            ariaLabel="Sync source"
            icon={<RefreshCw className="size-4" />}
            isLoading={busyId === source.id}
            label=""
            onClick={() => {
              onSync(source.id).catch(() => undefined);
            }}
            size={ButtonSize.SM}
            tooltip="Sync source"
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        <Button
          ariaLabel="Remove source"
          icon={<Trash2 className="size-4" />}
          label=""
          onClick={() => {
            onRemove(source.id).catch(() => undefined);
          }}
          size={ButtonSize.SM}
          tooltip="Remove source"
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}

function SourcePostCard({
  busyId,
  finding,
  isSelected = false,
  onCreateDraft,
  onOpenAgent,
  onOpenRemix,
  onSelect,
  post,
}: {
  busyId: string | null;
  finding?: AuthorizedResearchFinding;
  isSelected?: boolean;
  onCreateDraft: (
    post: ISourcePost,
    actionType: SourcePostActionType,
  ) => Promise<void>;
  onOpenAgent: (post: ISourcePost) => void;
  onOpenRemix: (post: ISourcePost) => void;
  onSelect?: (finding: AuthorizedResearchFinding) => void;
  post: ISourcePost;
}) {
  const translate = useTranslations('common.following');
  const title = post.text?.trim() || `${post.platform} source post`;
  const mediaUrl = getSafeExternalUrl(post.thumbnailUrl || post.mediaUrls?.[0]);
  const isVideo = post.contentType === 'video' || post.contentType === 'reel';
  const sourceUrl = getSafeExternalUrl(post.sourceUrl);

  return (
    <article className="overflow-hidden rounded-card bg-card shadow-border">
      {mediaUrl ? (
        <div className="relative aspect-[16/9] bg-secondary">
          {isVideo ? (
            <video
              aria-label={title}
              className="size-full object-cover"
              controls
              muted
              preload="metadata"
              src={mediaUrl}
            />
          ) : (
            <Image
              alt={title}
              className="object-cover"
              fill
              src={mediaUrl}
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized
            />
          )}
        </div>
      ) : null}
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/58">
          {getPlatformIcon(post.platform, 'h-4 w-4')}
          <span className="capitalize">{post.platform}</span>
          {post.authorHandle ? <span>@{post.authorHandle}</span> : null}
          {post.publishedAt ? (
            <span>{getRelativeTime(post.publishedAt)}</span>
          ) : null}
          <Badge variant="ghost">{post.contentType}</Badge>
        </div>
        <p className="line-clamp-5 text-sm leading-6 text-foreground/76">
          {title}
        </p>
        <MetricStrip post={post} />
        <div className="flex items-center gap-2">
          <Button
            className="min-w-0 flex-1 sm:flex-none"
            icon={<Sparkles className="size-3.5" />}
            label="Remix"
            onClick={() => onOpenRemix(post)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
          {finding && onSelect ? (
            <Button
              aria-pressed={isSelected}
              label={isSelected ? 'Selected' : 'Use as context'}
              onClick={() => onSelect(finding)}
              size={ButtonSize.SM}
              variant={
                isSelected ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
              }
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ariaLabel="More following actions"
                icon={<Ellipsis className="size-4" />}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {post.platform === SocialSourcePlatform.TWITTER ? (
                <>
                  <DropdownMenuItem
                    disabled={
                      busyId === `${post.id}-${SourcePostActionType.REPLY}`
                    }
                    onSelect={() => {
                      void onCreateDraft(post, SourcePostActionType.REPLY);
                    }}
                  >
                    <MessageSquare className="size-4" />
                    {translate('actions.reply')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={
                      busyId === `${post.id}-${SourcePostActionType.QUOTE}`
                    }
                    onSelect={() => {
                      void onCreateDraft(post, SourcePostActionType.QUOTE);
                    }}
                  >
                    <Zap className="size-4" />
                    {translate('actions.quote')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={
                      busyId === `${post.id}-${SourcePostActionType.REPOST}`
                    }
                    onSelect={() => {
                      void onCreateDraft(post, SourcePostActionType.REPOST);
                    }}
                  >
                    <Repeat2 className="size-4" />
                    {translate('actions.repost')}
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuItem
                disabled={busyId === `${post.id}-${SourcePostActionType.DRAFT}`}
                onSelect={() => {
                  void onCreateDraft(post, SourcePostActionType.DRAFT);
                }}
              >
                <Send className="size-4" />
                {translate('actions.createDraft')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenAgent(post)}>
                <Zap className="size-4" />
                {translate('actions.sendToAgent')}
              </DropdownMenuItem>
              {sourceUrl ? (
                <DropdownMenuItem
                  onSelect={() => {
                    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ExternalLink className="size-4" />
                  {translate('actions.openSource')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </article>
  );
}

export function getSafeExternalUrl(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function MetricStrip({ post }: { post: ISourcePost }) {
  const metrics = post.metrics ?? {};
  const items = [
    typeof metrics.views === 'number'
      ? `${formatCompactNumber(metrics.views)} views`
      : undefined,
    typeof metrics.likes === 'number'
      ? `${formatCompactNumber(metrics.likes)} likes`
      : undefined,
    typeof metrics.comments === 'number'
      ? `${formatCompactNumber(metrics.comments)} comments`
      : undefined,
    typeof metrics.shares === 'number'
      ? `${formatCompactNumber(metrics.shares)} shares`
      : undefined,
  ].filter(Boolean);

  if (!items.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3 text-xs text-foreground/55">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function toTrendSource(post: ISourcePost): {
  trend: TrendItem;
  source: TrendSourceItem;
} {
  const topic = post.text?.slice(0, 80) || 'Followed source post';
  return {
    source: {
      authorHandle: post.authorHandle ?? undefined,
      contentType: normalizeTrendContentType(post.contentType),
      id: post.id,
      metrics: post.metrics,
      platform: post.platform,
      publishedAt: post.publishedAt ?? undefined,
      sourceReferenceId: post.externalId,
      sourceUrl: post.sourceUrl ?? '',
      text: post.text ?? undefined,
      thumbnailUrl: post.thumbnailUrl ?? post.mediaUrls?.[0],
      title: topic,
    },
    trend: {
      expiresAt: post.publishedAt ?? new Date().toISOString(),
      growthRate: 0,
      id: `source-post-${post.id}`,
      isCurrent: true,
      mentions: 1,
      metadata: {
        source: 'public-reference',
        sampleContent: post.text ?? undefined,
      },
      platform: post.platform,
      requiresAuth: false,
      sourcePreviewState: 'live',
      sourcePreviewTotal: 1,
      topic,
      viralityScore: 0,
    },
  };
}

function normalizeTrendContentType(
  contentType: string,
): TrendSourceItem['contentType'] {
  if (
    contentType === 'image' ||
    contentType === 'post' ||
    contentType === 'tweet' ||
    contentType === 'video'
  ) {
    return contentType;
  }
  return contentType === 'reel' ? 'video' : 'post';
}
