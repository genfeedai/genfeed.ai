'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  TrendContentItem,
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import {
  buildTrendSourceAgentHref,
  buildTrendSourcePrompt,
  buildTrendSourceStudioHref,
  buildTrendSourceTwitterDraftHref,
} from '@utils/url/desktop-loop-url.util';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiBolt,
  HiOutlineDocumentDuplicate,
  HiOutlineFilm,
  HiOutlineSparkles,
} from 'react-icons/hi2';

function getViralityVariant(
  score: number,
): 'ghost' | 'info' | 'success' | 'warning' {
  if (score >= 75) {
    return 'success';
  }
  if (score >= 50) {
    return 'info';
  }
  if (score >= 25) {
    return 'warning';
  }
  return 'ghost';
}

function toTrendItem(item: TrendContentItem): TrendItem {
  return {
    expiresAt: item.publishedAt || new Date().toISOString(),
    growthRate: 0,
    id: item.trendId,
    isCurrent: true,
    mentions: item.trendMentions,
    metadata: {
      source: item.sourcePreviewState === 'fallback' ? 'apify' : 'apify',
    },
    platform: item.platform,
    requiresAuth: item.requiresAuth,
    sourcePreviewState: item.sourcePreviewState,
    sourcePreviewTotal: 1,
    topic: item.trendTopic,
    viralityScore: item.trendViralityScore,
  };
}

function toSourceItem(item: TrendContentItem): TrendSourceItem {
  return {
    authorHandle: item.authorHandle,
    contentType: item.contentType,
    id: item.id,
    mediaUrl: item.mediaUrl,
    metrics: item.metrics,
    platform: item.platform,
    publishedAt: item.publishedAt,
    sourceReferenceId: item.sourceReferenceId,
    sourceUrl: item.sourceUrl,
    text: item.text,
    thumbnailUrl: item.thumbnailUrl,
    title: item.title,
  };
}

export default function TrendContentCard({ item }: { item: TrendContentItem }) {
  const router = useRouter();
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const trend = useMemo(() => toTrendItem(item), [item]);
  const sourceItem = useMemo(() => toSourceItem(item), [item]);
  const previewTitle = item.title || item.text || item.trendTopic;
  const previewText =
    item.text && item.text !== previewTitle ? item.text : undefined;
  const previewMediaUrl = item.thumbnailUrl || item.mediaUrl;

  const handleCopyPrompt = useCallback(async () => {
    try {
      await clipboardService.copyToClipboard(
        buildTrendSourcePrompt(trend, sourceItem),
      );
      notificationsService.success('Prompt copied');
    } catch (error) {
      logger.error('Failed to copy trend content prompt', error);
      notificationsService.error('Failed to copy prompt');
    }
  }, [clipboardService, notificationsService, sourceItem, trend]);

  const handleOpenSource = useCallback(() => {
    window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
  }, [item.sourceUrl]);

  const handleSendToAgent = useCallback(() => {
    router.push(buildTrendSourceAgentHref(trend, sourceItem));
  }, [router, sourceItem, trend]);

  const handleRemix = useCallback(() => {
    if (item.platform === 'twitter') {
      router.push(buildTrendSourceTwitterDraftHref(trend, sourceItem));
      return;
    }

    router.push(buildTrendSourceStudioHref(trend, sourceItem));
  }, [item.platform, router, sourceItem, trend]);

  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-background/80 transition-colors hover:border-white/[0.16]">
      {previewMediaUrl ? (
        <div className="relative aspect-[16/9] overflow-hidden border-b border-white/[0.08] bg-white/[0.04]">
          <img
            alt={previewTitle}
            className="h-full w-full object-cover"
            src={previewMediaUrl}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <Badge variant={getViralityVariant(item.trendViralityScore)}>
              <HiBolt className="h-3 w-3" />
              {item.trendViralityScore}
            </Badge>
            <Badge variant="ghost">
              {item.sourcePreviewState === 'live'
                ? 'Live source'
                : 'Saved fallback'}
            </Badge>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          {getPlatformIcon(item.platform, 'h-4 w-4')}
          <span className="capitalize">{item.platform}</span>
          {item.authorHandle ? <span>@{item.authorHandle}</span> : null}
          {item.publishedAt ? (
            <span>{getRelativeTime(item.publishedAt)}</span>
          ) : null}
          <span>Rank #{item.contentRank}</span>
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold leading-snug text-foreground">
            {previewTitle}
          </h3>
          {previewText ? (
            <p className="line-clamp-4 text-sm leading-6 text-foreground/65">
              {previewText}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {item.matchedTrends.map((trendTopic) => (
            <Badge key={`${item.id}-${trendTopic}`} variant="ghost">
              {trendTopic}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/55">
          <span>{formatCompactNumber(item.trendMentions)} mentions</span>
          {item.metrics?.views ? (
            <span>{formatCompactNumber(item.metrics.views)} views</span>
          ) : null}
          {item.metrics?.likes ? (
            <span>{formatCompactNumber(item.metrics.likes)} likes</span>
          ) : null}
          {item.metrics?.comments ? (
            <span>{formatCompactNumber(item.metrics.comments)} comments</span>
          ) : null}
          {item.metrics?.shares ? (
            <span>{formatCompactNumber(item.metrics.shares)} shares</span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            icon={<HiOutlineSparkles className="h-3.5 w-3.5" />}
            label="Remix"
            onClick={handleRemix}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<HiArrowTopRightOnSquare className="h-3.5 w-3.5" />}
            label="Open Source"
            onClick={handleOpenSource}
            variant={ButtonVariant.GHOST}
          />
          <Button
            icon={<HiOutlineDocumentDuplicate className="h-3.5 w-3.5" />}
            label="Get Prompt"
            onClick={() => {
              handleCopyPrompt().catch(() => {
                /* handled in callback */
              });
            }}
            variant={ButtonVariant.GHOST}
          />
          <Button
            icon={<HiOutlineFilm className="h-3.5 w-3.5" />}
            label="Send to Agent"
            onClick={handleSendToAgent}
            variant={ButtonVariant.GHOST}
          />
        </div>
      </div>
    </article>
  );
}
