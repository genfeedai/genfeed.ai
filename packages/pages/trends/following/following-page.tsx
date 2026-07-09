'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  SocialSourcePlatform,
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
import { SocialsNavigation } from '@pages/trends/shared/socials-navigation';
import type {
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import { SourcePostsService } from '@services/social/source-posts.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  buildTrendSourceAgentHref,
  buildTrendSourceStudioHref,
  buildTrendSourceTwitterDraftHref,
} from '@utils/url/desktop-loop-url.util';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  HiArrowPath,
  HiArrowTopRightOnSquare,
  HiAtSymbol,
  HiOutlineBolt,
  HiOutlineChatBubbleLeftRight,
  HiOutlineInboxStack,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiPlus,
  HiTrash,
} from 'react-icons/hi2';

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

export default function FollowingPage() {
  const brandId = useBrandId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const [platform, setPlatform] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [newPlatform, setNewPlatform] = useState<SocialSourcePlatform>(
    SocialSourcePlatform.TWITTER,
  );
  const [newHandle, setNewHandle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );
  const getSourcePostsService = useAuthedService((token: string) =>
    SourcePostsService.getInstance(token),
  );

  const queryKey = ['social-sources-feed', brandId, platform, search];
  const { data = EMPTY_FEED, refetch } = useQuery<SocialSourcesResponse>({
    enabled: Boolean(brandId),
    initialData: EMPTY_FEED,
    queryFn: async () => {
      const service = await getSocialSourcesService();
      return service.getFollowingFeed({
        brand: brandId,
        platform: platform === 'all' ? undefined : platform,
        postsLimit: 50,
        search: search.trim() || undefined,
      });
    },
    queryKey,
  });

  const refreshFeed = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['social-sources-feed'] });
    await refetch();
  }, [queryClient, refetch]);

  const handleAddSource = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const handle = newHandle.trim();
      if (!handle) {
        return;
      }

      try {
        setIsAdding(true);
        const service = await getSocialSourcesService();
        const source = await service.post({
          handle,
          platform: newPlatform,
        });
        await service.syncSource(source.id, { brand: brandId, limit: 25 });
        setNewHandle('');
        notifications.success('Source followed');
        await refreshFeed();
      } catch (error) {
        logger.error('Failed to follow source', error);
        notifications.error('Failed to follow source');
      } finally {
        setIsAdding(false);
      }
    },
    [
      brandId,
      getSocialSourcesService,
      newHandle,
      newPlatform,
      notifications,
      refreshFeed,
    ],
  );

  const syncAll = useCallback(async () => {
    try {
      setBusyId('sync-all');
      const service = await getSocialSourcesService();
      await service.syncBrand({ brand: brandId, limit: 25 });
      notifications.success('Sources synced');
      await refreshFeed();
    } catch (error) {
      logger.error('Failed to sync sources', error);
      notifications.error('Failed to sync sources');
    } finally {
      setBusyId(null);
    }
  }, [brandId, getSocialSourcesService, notifications, refreshFeed]);

  const syncSource = useCallback(
    async (sourceId: string) => {
      try {
        setBusyId(sourceId);
        const service = await getSocialSourcesService();
        await service.syncSource(sourceId, { brand: brandId, limit: 25 });
        notifications.success('Source synced');
        await refreshFeed();
      } catch (error) {
        logger.error('Failed to sync source', error);
        notifications.error('Failed to sync source');
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
          { brand: brandId },
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
      const { source, trend } = toTrendSource(post);
      if (post.platform === SocialSourcePlatform.TWITTER) {
        router.push(buildTrendSourceTwitterDraftHref(trend, source));
        return;
      }
      router.push(buildTrendSourceStudioHref(trend, source));
    },
    [router],
  );

  return (
    <Container>
      <SectionTopbar
        title="Following"
        description="Collected posts from cross-social accounts followed by this brand."
      />
      <SocialsNavigation active="following" />

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
        <aside className="space-y-5">
          <Card bodyClassName="p-4">
            <form className="space-y-3" onSubmit={handleAddSource}>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HiAtSymbol className="size-4 text-foreground/60" />
                Follow source
              </div>
              <Select
                value={newPlatform}
                onValueChange={(value) =>
                  setNewPlatform(value as SocialSourcePlatform)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={newHandle}
                onChange={(event) => setNewHandle(event.target.value)}
                placeholder="@handle or profile URL"
              />
              <Button
                className="w-full"
                icon={<HiPlus className="size-4" />}
                isLoading={isAdding}
                label="Follow"
                size={ButtonSize.SM}
                type="submit"
                variant={ButtonVariant.DEFAULT}
              />
            </form>
          </Card>

          <Card bodyClassName="p-0">
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Sources
                  </div>
                  <div className="mt-1 text-xs text-foreground/58">
                    {data.summary.activeSources} active of{' '}
                    {data.summary.totalSources}
                  </div>
                </div>
                <Button
                  icon={<HiArrowPath className="size-4" />}
                  isLoading={busyId === 'sync-all'}
                  label="Sync"
                  size={ButtonSize.SM}
                  onClick={() => {
                    syncAll().catch(() => undefined);
                  }}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            </div>
            <div className="divide-y divide-border">
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
                  No followed sources yet.
                </div>
              )}
            </div>
          </Card>
        </aside>

        <main className="space-y-5">
          <Card bodyClassName="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Sources" value={data.summary.totalSources} />
                <Metric label="Posts" value={data.summary.totalPosts} />
                <Metric
                  label="Last sync"
                  value={
                    data.summary.lastSyncedAt
                      ? getRelativeTime(data.summary.lastSyncedAt)
                      : 'Never'
                  }
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="min-w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All platforms</SelectItem>
                    {PLATFORM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormSearchbar
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setSearch(event.target.value)
                  }
                  onClear={() => setSearch('')}
                  placeholder="Search source posts"
                />
              </div>
            </div>
          </Card>

          {data.posts.length ? (
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              {data.posts.map((post) => (
                <SourcePostCard
                  key={post.id}
                  busyId={busyId}
                  post={post}
                  onCreateDraft={createDraft}
                  onOpenAgent={openAgent}
                  onOpenRemix={openRemix}
                />
              ))}
            </div>
          ) : (
            <Card bodyClassName="p-10">
              <div className="mx-auto flex max-w-md flex-col items-center text-center">
                <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground/60">
                  <HiOutlineInboxStack className="size-5" />
                </div>
                <div className="mt-4 text-base font-semibold text-foreground">
                  No collected posts
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/68">
                  Follow sources or sync existing sources to populate this feed.
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>
    </Container>
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
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {getPlatformIcon(source.platform, 'h-4 w-4')}
          <span className="truncate">
            @{source.handle || source.displayName || 'source'}
          </span>
        </div>
        <div className="mt-1 text-xs text-foreground/52">
          {source.lastSyncedAt
            ? getRelativeTime(source.lastSyncedAt)
            : 'Never synced'}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          icon={<HiArrowPath className="size-4" />}
          isLoading={busyId === source.id}
          label=""
          onClick={() => {
            onSync(source.id).catch(() => undefined);
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
        <Button
          icon={<HiTrash className="size-4" />}
          label=""
          onClick={() => {
            onRemove(source.id).catch(() => undefined);
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
      </div>
    </div>
  );
}

function SourcePostCard({
  busyId,
  onCreateDraft,
  onOpenAgent,
  onOpenRemix,
  post,
}: {
  busyId: string | null;
  onCreateDraft: (
    post: ISourcePost,
    actionType: SourcePostActionType,
  ) => Promise<void>;
  onOpenAgent: (post: ISourcePost) => void;
  onOpenRemix: (post: ISourcePost) => void;
  post: ISourcePost;
}) {
  const title = post.text?.trim() || `${post.platform} source post`;
  const mediaUrl = post.thumbnailUrl || post.mediaUrls?.[0];

  return (
    <article className="overflow-hidden rounded-card bg-card shadow-border">
      {mediaUrl ? (
        <div className="relative aspect-[16/9] bg-secondary">
          <Image
            alt={title}
            className="object-cover"
            fill
            src={mediaUrl}
            sizes="(max-width: 1024px) 100vw, 50vw"
            unoptimized
          />
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
        <div className="flex flex-wrap gap-2">
          {post.platform === SocialSourcePlatform.TWITTER ? (
            <>
              <Button
                icon={<HiOutlineChatBubbleLeftRight className="size-3.5" />}
                isLoading={
                  busyId === `${post.id}-${SourcePostActionType.REPLY}`
                }
                label="Reply"
                onClick={() => {
                  onCreateDraft(post, SourcePostActionType.REPLY).catch(
                    () => undefined,
                  );
                }}
                variant={ButtonVariant.SECONDARY}
              />
              <Button
                icon={<HiOutlineBolt className="size-3.5" />}
                isLoading={
                  busyId === `${post.id}-${SourcePostActionType.QUOTE}`
                }
                label="QRT"
                onClick={() => {
                  onCreateDraft(post, SourcePostActionType.QUOTE).catch(
                    () => undefined,
                  );
                }}
                variant={ButtonVariant.GHOST}
              />
            </>
          ) : null}
          <Button
            icon={<HiOutlineSparkles className="size-3.5" />}
            label="Remix"
            onClick={() => onOpenRemix(post)}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<HiOutlinePaperAirplane className="size-3.5" />}
            label="Draft"
            isLoading={busyId === `${post.id}-${SourcePostActionType.DRAFT}`}
            onClick={() => {
              onCreateDraft(post, SourcePostActionType.DRAFT).catch(
                () => undefined,
              );
            }}
            variant={ButtonVariant.GHOST}
          />
          <Button
            icon={<HiOutlineBolt className="size-3.5" />}
            label="Agent"
            onClick={() => onOpenAgent(post)}
            variant={ButtonVariant.GHOST}
          />
          {post.sourceUrl ? (
            <Button
              icon={<HiArrowTopRightOnSquare className="size-3.5" />}
              label="Open"
              onClick={() =>
                window.open(
                  post.sourceUrl ?? '',
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              variant={ButtonVariant.GHOST}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 border-l border-border bg-background-secondary px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/45">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
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
