'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  SocialSourcePlatform,
  SourcePostActionType,
} from '@genfeedai/enums';
import type { ISourcePost, ITrendVideo } from '@genfeedai/interfaces';
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
import { ContentRunsService } from '@services/content/content-runs.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SourcePostsService } from '@services/social/source-posts.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
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
import { type MouseEvent, useCallback, useMemo, useState } from 'react';

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

interface DeskTableRowProps {
  href: (path: string) => string;
  isCursored: boolean;
  isSelected: boolean;
  item: DiscoveryDeskItem;
  onCursor: (key: string) => void;
  onSelectFinding?: (item: DiscoveryDeskItem) => void;
  onToggleSelect: (key: string) => void;
}

function DeskTableRow({
  href,
  isCursored,
  isSelected,
  item,
  onCursor,
  onSelectFinding,
  onToggleSelect,
}: DeskTableRowProps) {
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

  const [isExpanded, setIsExpanded] = useState(false);
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const pair = useMemo(() => toTrendSourcePair(item), [item]);
  const safeSourceUrl = getSafeExternalUrl(item.sourceUrl);
  const embedUrl =
    item.raw.kind === 'viral_video' ? getVideoEmbedUrl(item.raw.video) : null;
  const previewMediaUrl = getSafeExternalUrl(
    item.mediaUrl || item.thumbnailUrl,
  );
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

  const stopRowClick = (event: MouseEvent) => event.stopPropagation();

  return (
    <>
      <TableRow
        className={isCursored ? 'ring-1 ring-inset ring-primary/50' : undefined}
        data-state={isSelected ? 'selected' : undefined}
        onClick={() => onCursor(item.key)}
      >
        <TableCell onClick={stopRowClick}>
          <Checkbox
            aria-label={`Select ${item.title || item.text || item.key}`}
            isChecked={isSelected}
            name={`select-${item.key}`}
            onChange={() => onToggleSelect(item.key)}
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {getPlatformIcon(item.platform, 'size-4')}
            <span className="truncate text-sm text-foreground/80">
              {item.authorHandle ? `@${item.authorHandle}` : item.platform}
            </span>
          </div>
        </TableCell>
        <TableCell className="max-w-sm" onClick={stopRowClick}>
          <Button
            className="flex items-start gap-2 text-left"
            onClick={() => setIsExpanded((prev) => !prev)}
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
        </TableCell>
        <TableCell>
          <Badge className="capitalize" variant="ghost">
            {item.source}
          </Badge>
        </TableCell>
        <TableCell className="text-xs text-foreground/70">
          {formatCompactNumber(item.velocity)}/h
        </TableCell>
        <TableCell className="text-xs text-foreground/70">
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3" />
            {Math.round(item.virality)}
          </span>
        </TableCell>
        <TableCell className="text-xs text-foreground/70">
          {formatCompactNumber(item.engagement)}
        </TableCell>
        <TableCell className="text-xs text-foreground/55">
          {item.publishedAt ? getRelativeTime(item.publishedAt) : '—'}
        </TableCell>
        <TableCell onClick={stopRowClick}>
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
                    Use as context
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded ? (
        <TableRow onClick={stopRowClick}>
          <TableCell className="bg-secondary/30 p-4" colSpan={9}>
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
              <p className="mt-3 max-w-2xl text-sm text-foreground/70">
                {item.text}
              </p>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * The Desk's dense, keyboard-navigable table view (Direction A). Row actions
 * are per-item components (not inline handlers in a `.map`) so each row can
 * own its own hooks — mirrors the `trend-content-card.tsx` / `SourcePostCard`
 * pattern from the pages this replaces.
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Select</span>
          </TableHead>
          <TableHead>Author</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Velocity</TableHead>
          <TableHead>Virality</TableHead>
          <TableHead>Engagement</TableHead>
          <TableHead>Published</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <DeskTableRow
            key={item.key}
            href={href}
            isCursored={cursorKey === item.key}
            isSelected={selection.has(item.key)}
            item={item}
            onCursor={onCursor}
            onSelectFinding={onSelectFinding}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </TableBody>
    </Table>
  );
}
