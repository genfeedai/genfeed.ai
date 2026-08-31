'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import type { AuthorizedResearchFinding } from '@pages/research/work-surface/research-work-surface.types';
import type {
  TrendContentItem,
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import { ContentRunsService } from '@services/content/content-runs.service';
import { ClipboardService } from '@services/core/clipboard.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  buildSourcePostVariationsHref,
  buildTrendSourceAgentHref,
  buildTrendSourcePrompt,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import {
  ClipboardList,
  Copy,
  Ellipsis,
  ExternalLink,
  Film,
  Sparkles,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

const PREFILLED_ORGANIC_REMIX_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'youtube',
]);

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
      source: item.sourceClassification ? 'public-reference' : 'apify',
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
    sourceClassification: item.sourceClassification,
    sourceUrl: item.sourceUrl,
    text: item.text,
    thumbnailUrl: item.thumbnailUrl,
    title: item.title,
  };
}

export default function TrendContentCard({
  finding,
  isSelected = false,
  item,
  onSelect,
}: {
  finding?: AuthorizedResearchFinding;
  isSelected?: boolean;
  item: TrendContentItem;
  onSelect?: (finding: AuthorizedResearchFinding) => void;
}) {
  const translate = useTranslations('common.trends.card');
  const brandId = useBrandId();
  const router = useRouter();
  const remixSurface = useOptionalDiscoveryRemix();
  const { href } = useOrgUrl();
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const clipboardService = useMemo(() => ClipboardService.getInstance(), []);
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getContentRunsService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
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

  const remixHref = useMemo(
    () =>
      href(
        buildSourcePostVariationsHref({
          platform: item.platform,
          sourceReferenceId: item.sourceReferenceId,
          trendId: item.trendId,
        }),
      ),
    [href, item.platform, item.sourceReferenceId, item.trendId],
  );
  const isPrefilledRemixPlatform = PREFILLED_ORGANIC_REMIX_PLATFORMS.has(
    item.platform,
  );
  const hasDurableSourceReference = Boolean(item.sourceReferenceId);
  const opensPrefilledRemix =
    isPrefilledRemixPlatform &&
    hasDurableSourceReference &&
    Boolean(remixSurface);
  const opensLegacyRemix =
    hasDurableSourceReference &&
    isSourcePostVariationPlatform(item.platform) &&
    !opensPrefilledRemix;
  const isRemixUnavailable =
    isPrefilledRemixPlatform &&
    hasDurableSourceReference &&
    !remixSurface &&
    !opensLegacyRemix;

  const handleSaveBrief = useCallback(async () => {
    if (!brandId) {
      notificationsService.error('Select a brand before saving a brief');
      return;
    }

    try {
      setIsSavingBrief(true);
      const service = await getContentRunsService();
      await service.createResearchBriefRun(brandId, {
        angle: previewTitle,
        channelFit: `${item.platform} ${item.contentType} with ${item.trendViralityScore} virality score`,
        contentType: item.contentType,
        evidence: [
          previewTitle,
          previewText,
          item.authorHandle ? `Creator: @${item.authorHandle}` : undefined,
          item.sourceUrl ? `Source: ${item.sourceUrl}` : undefined,
        ].filter((value): value is string => Boolean(value)),
        hypothesis: `Remix ${item.trendTopic} into a brand-fit ${item.platform} execution.`,
        matchedTrends: item.matchedTrends,
        metrics: item.metrics,
        platform: item.platform,
        sourceContentId: item.id,
        sourceReferenceId: item.sourceReferenceId,
        sourceUrl: item.sourceUrl,
        text: item.text,
        title: item.title,
        trendId: item.trendId,
        trendTopic: item.trendTopic,
      });
      notificationsService.success('Brief saved to Content Runs');
    } catch (error) {
      logger.error('Failed to save research brief', error);
      notificationsService.error('Failed to save brief');
    } finally {
      setIsSavingBrief(false);
    }
  }, [
    brandId,
    getContentRunsService,
    item,
    notificationsService,
    previewText,
    previewTitle,
  ]);

  return (
    <Card className="hover:shadow-border-strong" bodyClassName="gap-0 p-0">
      {previewMediaUrl ? (
        <div className="relative aspect-[16/9] overflow-hidden bg-secondary">
          <Image
            alt={previewTitle}
            className="object-cover"
            fill
            src={previewMediaUrl}
            sizes="(max-width: 768px) 100vw, 50vw"
            unoptimized
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <Badge variant={getViralityVariant(item.trendViralityScore)}>
              <Zap className="size-3" />
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
          <span>{translate('rank', { rank: item.contentRank })}</span>
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
          <span>
            {translate('metrics.mentions', {
              count: formatCompactNumber(item.trendMentions),
            })}
          </span>
          {item.metrics?.views ? (
            <span>
              {translate('metrics.views', {
                count: formatCompactNumber(item.metrics.views),
              })}
            </span>
          ) : null}
          {item.metrics?.likes ? (
            <span>
              {translate('metrics.likes', {
                count: formatCompactNumber(item.metrics.likes),
              })}
            </span>
          ) : null}
          {item.metrics?.comments ? (
            <span>
              {translate('metrics.comments', {
                count: formatCompactNumber(item.metrics.comments),
              })}
            </span>
          ) : null}
          {item.metrics?.shares ? (
            <span>
              {translate('metrics.shares', {
                count: formatCompactNumber(item.metrics.shares),
              })}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {opensPrefilledRemix ? (
            <Button
              className="min-w-0 flex-1 sm:flex-none"
              icon={<Sparkles className="size-3.5" />}
              label={translate('actions.remix')}
              onClick={() => {
                if (!item.sourceReferenceId) {
                  return;
                }
                void remixSurface?.openRemix({
                  kind: 'trend_reference',
                  sourceReferenceId: item.sourceReferenceId,
                  trendId: item.trendId,
                });
              }}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : opensLegacyRemix ? (
            <Button
              asChild
              className="min-w-0 flex-1 sm:flex-none"
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link aria-label={translate('actions.remix')} href={remixHref}>
                <Sparkles className="size-3.5" />
                {translate('actions.remix')}
              </Link>
            </Button>
          ) : isRemixUnavailable ? (
            <Button
              className="min-w-0 flex-1 sm:flex-none"
              icon={<Sparkles className="size-3.5" />}
              isDisabled
              label={translate('actions.remixUnavailable')}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
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
                ariaLabel="More trend actions"
                icon={<Ellipsis className="size-4" />}
                size={ButtonSize.ICON}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                disabled={isSavingBrief}
                onSelect={() => {
                  void handleSaveBrief();
                }}
              >
                <ClipboardList className="size-4" />
                {isSavingBrief ? 'Saving brief…' : 'Save brief'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  void handleCopyPrompt();
                }}
              >
                <Copy className="size-4" />
                {translate('actions.copyPrompt')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleOpenSource}>
                <ExternalLink className="size-4" />
                {translate('actions.openSource')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleSendToAgent}>
                <Film className="size-4" />
                {translate('actions.sendToAgent')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
