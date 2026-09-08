'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  SocialSourcePlatform,
  SourcePostActionType,
} from '@genfeedai/contracts';
import type { ISourcePost, ITrendVideo } from '@genfeedai/contracts/interfaces';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import { getSafeExternalUrl } from '@pages/trends/shared/safe-external-url';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';
import type {
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { ContentRunsService } from '@services/content/content-runs.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SourcePostsService } from '@services/social/source-posts.service';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import {
  buildSourcePostVariationsHref,
  buildTrendSourceAgentHref,
  buildTrendSourcePrompt,
} from '@utils/url/desktop-loop-url.util';
import {
  Copy,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Repeat2,
  Sparkles,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

/** Mirrors `following-page.tsx`'s `normalizeTrendContentType` — duplicated
 * here on purpose since that file is scheduled for deletion once the Desk
 * ships. */
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

/** Builds the `TrendItem`/`TrendSourceItem` pair the shared agent-prompt and
 * copy-prompt builders in `desktop-loop-url.util.ts` expect. `viral_video`
 * items have no such pair — they carry no durable source reference and
 * surface as research context only (see `desk-items.ts`). */
function toTrendSourcePair(
  item: DiscoveryDeskItem,
): { source: TrendSourceItem; trend: TrendItem } | null {
  if (item.raw.kind === 'trend') {
    const raw = item.raw.item;
    const trend: TrendItem = {
      expiresAt: raw.publishedAt || new Date().toISOString(),
      growthRate: 0,
      id: raw.trendId,
      isCurrent: true,
      mentions: raw.trendMentions,
      metadata: {
        source: raw.sourceClassification ? 'public-reference' : 'apify',
      },
      platform: raw.platform,
      requiresAuth: raw.requiresAuth,
      sourcePreviewState: raw.sourcePreviewState,
      sourcePreviewTotal: 1,
      topic: raw.trendTopic,
      viralityScore: raw.trendViralityScore,
    };
    const source: TrendSourceItem = {
      authorHandle: raw.authorHandle,
      contentType: raw.contentType,
      id: raw.id,
      mediaUrl: raw.mediaUrl,
      metrics: raw.metrics,
      platform: raw.platform,
      publishedAt: raw.publishedAt,
      sourceClassification: raw.sourceClassification,
      sourceReferenceId: raw.sourceReferenceId,
      sourceUrl: raw.sourceUrl,
      text: raw.text,
      thumbnailUrl: raw.thumbnailUrl,
      title: raw.title,
    };
    return { source, trend };
  }

  if (item.raw.kind === 'source_post') {
    const post = item.raw.post;
    const topic = post.text?.slice(0, 80) || `${post.platform} source post`;
    const trend: TrendItem = {
      expiresAt: post.publishedAt ?? new Date().toISOString(),
      growthRate: 0,
      id: `source-post-${post.id}`,
      isCurrent: true,
      mentions: 1,
      metadata: {
        sampleContent: post.text ?? undefined,
        source: 'public-reference',
      },
      platform: post.platform,
      requiresAuth: false,
      sourcePreviewState: 'live',
      sourcePreviewTotal: 1,
      topic,
      viralityScore: 0,
    };
    const source: TrendSourceItem = {
      authorHandle: post.authorHandle ?? undefined,
      contentType: normalizeTrendContentType(post.contentType),
      id: post.id,
      mediaUrl: post.mediaUrls?.[0],
      metrics: post.metrics,
      platform: post.platform,
      publishedAt: post.publishedAt ?? undefined,
      sourceReferenceId: post.externalId,
      sourceUrl: post.sourceUrl ?? '',
      text: post.text ?? undefined,
      thumbnailUrl: post.thumbnailUrl ?? post.mediaUrls?.[0] ?? undefined,
      title: topic,
    };
    return { source, trend };
  }

  return null;
}

/** Mirrors `trends-list.tsx`'s viral-video embed resolution — duplicated
 * here on purpose (same reason as `normalizeTrendContentType`). */
function getVideoEmbedUrl(video: ITrendVideo): string | null {
  if (!video.videoUrl) return null;

  let externalId = video.externalId ?? null;
  let hostname = '';
  try {
    const url = new URL(video.videoUrl);
    hostname = url.hostname;
    if (!externalId) {
      externalId =
        url.pathname.match(/\/video\/([^/?]+)/)?.[1] ??
        (hostname === 'youtu.be'
          ? (url.pathname.split('/').filter(Boolean)[0] ?? null)
          : url.searchParams.get('v'));
    }
  } catch {
    return null;
  }

  if (!externalId) return null;

  if (hostname.includes('tiktok')) {
    return `https://www.tiktok.com/player/v1/${encodeURIComponent(externalId)}?autoplay=0&loop=0&muted=0`;
  }
  if (hostname.includes('youtu')) {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}`;
  }
  return null;
}

interface DeskRowActionsProps {
  href: (path: string) => string;
  item: DiscoveryDeskItem;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
}

/**
 * The row's action cluster. It is a component rather than an inline `render`
 * body so each row owns its own hooks and request state — the pattern
 * `trend-content-card.tsx` and `SourcePostCard` already use.
 */
function DeskRowActions({ href, item, onSelectFinding }: DeskRowActionsProps) {
  const brandId = useBrandId();
  const router = useRouter();
  const remixSurface = useOptionalDiscoveryRemix();
  const translateCard = useTranslations('common.trends.card');
  const translateFollowing = useTranslations('common.following');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const getSourcePostsService = useAuthedService((token: string) =>
    SourcePostsService.getInstance(token),
  );

  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const pair = useMemo(() => toTrendSourcePair(item), [item]);
  const safeSourceUrl = getSafeExternalUrl(item.sourceUrl);
  const isTwitterSourcePost =
    item.raw.kind === 'source_post' &&
    item.platform === SocialSourcePlatform.TWITTER;

  const handleRemix = useCallback(() => {
    if (!item.remixSelector) return;
    if (remixSurface) {
      void remixSurface.openRemix(item.remixSelector);
      return;
    }
    const selector = item.remixSelector;
    router.push(
      href(
        buildSourcePostVariationsHref({
          platform: item.platform,
          sourcePostId:
            selector.kind === 'source_post' ? selector.sourcePostId : undefined,
          sourceReferenceId:
            selector.kind === 'trend_reference'
              ? selector.sourceReferenceId
              : undefined,
          trendId:
            selector.kind === 'trend_reference' ? selector.trendId : undefined,
        }),
      ),
    );
  }, [href, item, remixSurface, router]);

  const handleCopyPrompt = useCallback(async () => {
    if (!pair) return;
    try {
      await clipboardService.copyToClipboard(
        buildTrendSourcePrompt(pair.trend, pair.source),
      );
      notifications.success('Prompt copied');
    } catch (error) {
      logger.error('Failed to copy trend content prompt', error);
      notifications.error('Failed to copy prompt');
    }
  }, [clipboardService, notifications, pair]);

  const handleOpenSource = useCallback(() => {
    if (!safeSourceUrl) return;
    window.open(safeSourceUrl, '_blank', 'noopener,noreferrer');
  }, [safeSourceUrl]);

  const handleSendToAgent = useCallback(() => {
    if (!pair) return;
    router.push(buildTrendSourceAgentHref(pair.trend, pair.source));
  }, [pair, router]);

  const handleSaveBrief = useCallback(async () => {
    if (item.raw.kind !== 'trend' || !brandId) return;
    const raw = item.raw.item;
    try {
      setIsSavingBrief(true);
      const service = await getContentRunsService();
      await service.createResearchBriefRun(brandId, {
        angle: raw.title || raw.trendTopic,
        channelFit: `${raw.platform} ${raw.contentType} with ${raw.trendViralityScore} virality score`,
        contentType: raw.contentType,
        evidence: [
          raw.title,
          raw.text,
          raw.authorHandle ? `Creator: @${raw.authorHandle}` : undefined,
          raw.sourceUrl ? `Source: ${raw.sourceUrl}` : undefined,
        ].filter((value): value is string => Boolean(value)),
        hypothesis: `Remix ${raw.trendTopic} into a brand-fit ${raw.platform} execution.`,
        matchedTrends: raw.matchedTrends,
        metrics: raw.metrics,
        platform: raw.platform,
        sourceContentId: raw.id,
        sourceReferenceId: raw.sourceReferenceId,
        sourceUrl: raw.sourceUrl,
        text: raw.text,
        title: raw.title,
        trendId: raw.trendId,
        trendTopic: raw.trendTopic,
      });
      notifications.success('Brief saved to Content Runs');
    } catch (error) {
      logger.error('Failed to save research brief', error);
      notifications.error('Failed to save brief');
    } finally {
      setIsSavingBrief(false);
    }
  }, [brandId, getContentRunsService, item, notifications]);

  const handleCreateDraft = useCallback(
    async (actionType: SourcePostActionType) => {
      if (item.raw.kind !== 'source_post' || !brandId) return;
      const post: ISourcePost = item.raw.post;
      try {
        setBusyAction(actionType);
        const service = await getSourcePostsService();
        await service.createDraft(post.id, { actionType }, { brandId });
        notifications.success('Draft created');
      } catch (error) {
        logger.error('Failed to create source post draft', error);
        notifications.error('Failed to create draft');
      } finally {
        setBusyAction(null);
      }
    },
    [brandId, getSourcePostsService, item, notifications],
  );

  return (
    <div className="flex items-center justify-end gap-1">
      {item.remixSelector ? (
        <Button
          icon={<Sparkles className="size-3.5" />}
          label={translateCard('actions.remix')}
          onClick={handleRemix}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
      ) : (
        <SimpleTooltip label={translateCard('actions.remixUnavailable')}>
          <Button
            icon={<Sparkles className="size-3.5" />}
            isDisabled
            label={translateCard('actions.remix')}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        </SimpleTooltip>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ariaLabel="More actions"
            icon={<MoreHorizontal className="size-4" />}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {isTwitterSourcePost ? (
            <>
              <DropdownMenuItem
                disabled={busyAction === SourcePostActionType.REPLY}
                onSelect={() => {
                  void handleCreateDraft(SourcePostActionType.REPLY);
                }}
              >
                <MessageSquare className="size-4" />
                {translateFollowing('actions.reply')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busyAction === SourcePostActionType.QUOTE}
                onSelect={() => {
                  void handleCreateDraft(SourcePostActionType.QUOTE);
                }}
              >
                <Zap className="size-4" />
                {translateFollowing('actions.quote')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busyAction === SourcePostActionType.REPOST}
                onSelect={() => {
                  void handleCreateDraft(SourcePostActionType.REPOST);
                }}
              >
                <Repeat2 className="size-4" />
                {translateFollowing('actions.repost')}
              </DropdownMenuItem>
            </>
          ) : null}
          {item.raw.kind === 'source_post' ? (
            <DropdownMenuItem
              disabled={busyAction === SourcePostActionType.DRAFT}
              onSelect={() => {
                void handleCreateDraft(SourcePostActionType.DRAFT);
              }}
            >
              <FileText className="size-4" />
              {translateFollowing('actions.createDraft')}
            </DropdownMenuItem>
          ) : null}
          {item.raw.kind === 'trend' ? (
            <DropdownMenuItem
              disabled={isSavingBrief}
              onSelect={() => {
                void handleSaveBrief();
              }}
            >
              <FileText className="size-4" />
              {isSavingBrief ? 'Saving brief…' : 'Save brief'}
            </DropdownMenuItem>
          ) : null}
          {pair ? (
            <DropdownMenuItem
              onSelect={() => {
                void handleCopyPrompt();
              }}
            >
              <Copy className="size-4" />
              {translateCard('actions.copyPrompt')}
            </DropdownMenuItem>
          ) : null}
          {safeSourceUrl ? (
            <DropdownMenuItem onSelect={handleOpenSource}>
              <ExternalLink className="size-4" />
              {translateCard('actions.openSource')}
            </DropdownMenuItem>
          ) : null}
          {pair ? (
            <DropdownMenuItem onSelect={handleSendToAgent}>
              <Zap className="size-4" />
              {translateCard('actions.sendToAgent')}
            </DropdownMenuItem>
          ) : null}
          {onSelectFinding ? (
            <DropdownMenuItem onSelect={() => onSelectFinding(item)}>
              {translateCard('actions.useAsContext')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Title cell: the whole label toggles the row's detail panel. */
function DeskContentCell({
  isExpanded,
  item,
  onToggle,
}: {
  isExpanded: boolean;
  item: DiscoveryDeskItem;
  onToggle: (key: string) => void;
}) {
  return (
    <Button
      aria-expanded={isExpanded}
      className="flex items-start gap-2 text-left"
      onClick={() => onToggle(item.key)}
      type="button"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      {item.thumbnailUrl ? (
        <span className="relative block size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="40px"
            src={item.thumbnailUrl}
            unoptimized
          />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {item.title || item.text || item.trendTopic || 'Untitled'}
        </span>
        {item.text && item.title ? (
          <span className="block truncate text-xs text-foreground/55">
            {item.text}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

/** Detail panel shown beneath an expanded row. */
function DeskExpandedDetail({ item }: { item: DiscoveryDeskItem }) {
  const embedUrl =
    item.raw.kind === 'viral_video' ? getVideoEmbedUrl(item.raw.video) : null;
  const previewMediaUrl = getSafeExternalUrl(
    item.mediaUrl || item.thumbnailUrl,
  );

  return (
    <>
      {embedUrl ? (
        <iframe
          allow="autoplay; encrypted-media"
          className="aspect-video w-full max-w-md rounded-lg"
          src={embedUrl}
          title={item.title || 'Video preview'}
        />
      ) : previewMediaUrl ? (
        <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg bg-secondary">
          <Image
            alt={item.title || ''}
            className="object-cover"
            fill
            src={previewMediaUrl}
            unoptimized
          />
        </div>
      ) : null}
      {item.text ? (
        <p className="mt-3 max-w-2xl text-sm text-foreground/70">{item.text}</p>
      ) : null}
    </>
  );
}

/**
 * The Desk's dense, keyboard-navigable table view (Direction A).
 *
 * It renders through the shared `Table`, like every other table surface, so
 * selection, the row frame, empty and loading states come from one place
 * instead of being rebuilt on the raw primitives. Cells that need request
 * state stay components, so each row still owns its own hooks.
 */
export default function DeskTableView({
  cursorKey,
  href,
  items,
  onCursor,
  onSelectFinding,
  onToggleSelect,
  selection,
}: {
  cursorKey: string | null;
  href: (path: string) => string;
  items: DiscoveryDeskItem[];
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
  selection: Set<string>;
}) {
  const translateDesk = useTranslations('common.trends.desk');
  const translateCard = useTranslations('common.trends.card');
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const handleToggleExpanded = useCallback((key: string) => {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }, []);

  // The Desk owns selection as a Set keyed by row, and the shared table
  // reports the whole selected list. Toggle only what actually changed so a
  // select-all still arrives as one toggle per row.
  const handleSelectionChange = useCallback(
    (selectedIds: string[]) => {
      const next = new Set(selectedIds);
      for (const key of next) {
        if (!selection.has(key)) onToggleSelect(key);
      }
      for (const key of selection) {
        if (!next.has(key)) onToggleSelect(key);
      }
    },
    [onToggleSelect, selection],
  );

  const columns = useMemo<TableColumn<DiscoveryDeskItem>[]>(
    () => [
      {
        header: translateDesk('tableHeaders.author'),
        key: 'author',
        render: (item) => (
          <div className="flex items-center gap-2">
            {getPlatformIcon(item.platform, 'size-4')}
            <span className="truncate text-sm text-foreground/80">
              {item.authorHandle ? `@${item.authorHandle}` : item.platform}
            </span>
          </div>
        ),
      },
      {
        className: 'max-w-sm',
        header: translateDesk('tableHeaders.content'),
        key: 'content',
        render: (item) => (
          <DeskContentCell
            isExpanded={expandedKeys.has(item.key)}
            item={item}
            onToggle={handleToggleExpanded}
          />
        ),
      },
      {
        header: translateDesk('tableHeaders.source'),
        key: 'source',
        render: (item) => (
          <Badge className="capitalize" variant="ghost">
            {item.source}
          </Badge>
        ),
      },
      {
        className: 'text-xs text-foreground/70',
        header: translateDesk('tableHeaders.velocity'),
        key: 'velocity',
        render: (item) =>
          translateCard('velocityPerHour', {
            value: formatCompactNumber(item.velocity),
          }),
      },
      {
        className: 'text-xs text-foreground/70',
        header: translateDesk('tableHeaders.virality'),
        key: 'virality',
        render: (item) => (
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3" />
            {Math.round(item.virality)}
          </span>
        ),
      },
      {
        className: 'text-xs text-foreground/70',
        header: translateDesk('tableHeaders.engagement'),
        key: 'engagement',
        render: (item) => formatCompactNumber(item.engagement),
      },
      {
        className: 'text-xs text-foreground/55',
        header: translateDesk('tableHeaders.published'),
        key: 'published',
        render: (item) =>
          item.publishedAt ? getRelativeTime(item.publishedAt) : '—',
      },
      {
        className: 'text-right',
        header: translateDesk('tableHeaders.actions'),
        key: 'actions',
        render: (item) => (
          <DeskRowActions
            href={href}
            item={item}
            onSelectFinding={onSelectFinding}
          />
        ),
      },
    ],
    [
      expandedKeys,
      handleToggleExpanded,
      href,
      onSelectFinding,
      translateCard,
      translateDesk,
    ],
  );

  return (
    <AppTable
      ariaLabel={translateDesk('title')}
      columns={columns}
      framed={false}
      getItemId={(item) => item.key}
      getRowClassName={(item) =>
        cursorKey === item.key ? 'ring-1 ring-inset ring-primary/50' : ''
      }
      getRowKey={(item) => item.key}
      items={items}
      onRowClick={(item) => onCursor(item.key)}
      onSelectionChange={handleSelectionChange}
      renderExpandedRow={(item) =>
        expandedKeys.has(item.key) ? (
          <DeskExpandedDetail item={item} />
        ) : undefined
      }
      selectable
      selectedIds={Array.from(selection)}
    />
  );
}
