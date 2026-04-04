'use client';

import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type {
  TrendItem,
  TrendSourceItem,
} from '@props/trends/trends-page.props';
import Badge from '@ui/display/badge/Badge';
import type { ReactNode } from 'react';
import { HiBolt } from 'react-icons/hi2';

export function getTrendViralityVariant(
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

function getTrendPreviewLabel(
  previewState?: TrendItem['sourcePreviewState'],
): string {
  if (previewState === 'live') {
    return 'Live preview';
  }
  if (previewState === 'fallback') {
    return 'Metadata fallback';
  }
  return 'Preview unavailable';
}

function getSourceBadgeVariant(
  source?: TrendItem['metadata'] extends infer M
    ? M extends { source?: infer S }
      ? S
      : never
    : never,
) {
  if (source === 'curated') {
    return 'secondary';
  }

  return 'ghost';
}

export function TrendPreviewCard({
  trend,
  emptyMessage = 'Trend detected, source posts were not resolved yet.',
  footerMessage,
  renderPrimaryActions,
  renderSecondaryAction,
}: {
  trend: TrendItem;
  emptyMessage?: string;
  footerMessage?: string;
  renderPrimaryActions?: (sourceItem?: TrendSourceItem) => ReactNode;
  renderSecondaryAction?: (sourceItem: TrendSourceItem) => ReactNode;
}) {
  const source = trend.metadata?.source;
  const sourceItems = trend.sourcePreview ?? [];
  const primarySourceItem = sourceItems[0];
  const secondarySourceItems = sourceItems.slice(1);
  const previewMediaUrl =
    primarySourceItem?.thumbnailUrl || primarySourceItem?.mediaUrl;

  return (
    <article className="group overflow-hidden rounded-xl border border-white/[0.08] bg-background/80 transition-colors hover:border-white/[0.16]">
      {previewMediaUrl ? (
        <div className="relative aspect-[16/9] overflow-hidden border-b border-white/[0.08] bg-white/[0.04]">
          <img
            alt={
              primarySourceItem?.title || primarySourceItem?.text || trend.topic
            }
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            src={previewMediaUrl}
          />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <Badge variant={getTrendViralityVariant(trend.viralityScore)}>
              <HiBolt className="h-3 w-3" />
              {trend.viralityScore}
            </Badge>
            {source ? (
              <Badge variant={getSourceBadgeVariant(source)}>{source}</Badge>
            ) : primarySourceItem?.contentType ? (
              <div className="rounded-full border border-black/10 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
                {primarySourceItem.contentType}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
          {getPlatformIcon(trend.platform, 'h-4 w-4')}
          <span className="capitalize">{trend.platform}</span>
          {primarySourceItem?.authorHandle ? (
            <span>@{primarySourceItem.authorHandle}</span>
          ) : null}
          {trend.createdAt ? (
            <span>Updated {getRelativeTime(trend.createdAt)}</span>
          ) : null}
          {trend.sourcePreviewState === 'fallback' && !previewMediaUrl ? (
            <Badge variant="ghost">Fallback preview</Badge>
          ) : null}
          {!trend.createdAt ? (
            <span>{getTrendPreviewLabel(trend.sourcePreviewState)}</span>
          ) : null}
        </div>

        <div className="space-y-2">
          <h3 className="text-base font-semibold leading-snug text-foreground">
            {trend.topic}
          </h3>
          {primarySourceItem ? (
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground/90">
                {primarySourceItem.title ||
                  primarySourceItem.text ||
                  'Untitled'}
              </div>
              {primarySourceItem.text &&
              primarySourceItem.title !== primarySourceItem.text ? (
                <p className="line-clamp-4 text-sm leading-6 text-foreground/65">
                  {primarySourceItem.text}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm italic text-foreground/45">{emptyMessage}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/55">
          {!previewMediaUrl ? (
            <Badge variant={getTrendViralityVariant(trend.viralityScore)}>
              <HiBolt className="h-3 w-3" />
              {trend.viralityScore}
            </Badge>
          ) : null}
          <span>{formatCompactNumber(trend.mentions)} mentions</span>
          {trend.growthRate > 0 ? (
            <span className="text-emerald-400">
              +{Math.round(trend.growthRate)}%
            </span>
          ) : null}
          {trend.sourcePreviewTotal ? (
            <span>
              {trend.sourcePreviewTotal} source item
              {trend.sourcePreviewTotal === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {primarySourceItem?.metrics ? (
          <div className="flex flex-wrap gap-3 text-[11px] text-foreground/45">
            {primarySourceItem.metrics.views ? (
              <span>
                {formatCompactNumber(primarySourceItem.metrics.views)} views
              </span>
            ) : null}
            {primarySourceItem.metrics.likes ? (
              <span>
                {formatCompactNumber(primarySourceItem.metrics.likes)} likes
              </span>
            ) : null}
            {primarySourceItem.metrics.comments ? (
              <span>
                {formatCompactNumber(primarySourceItem.metrics.comments)}{' '}
                comments
              </span>
            ) : null}
            {primarySourceItem.metrics.shares ? (
              <span>
                {formatCompactNumber(primarySourceItem.metrics.shares)} shares
              </span>
            ) : null}
          </div>
        ) : null}

        {renderPrimaryActions ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {renderPrimaryActions(primarySourceItem)}
          </div>
        ) : null}

        {secondarySourceItems.length > 0 ? (
          <div className="grid gap-2">
            {secondarySourceItems.map((sourceItem) => (
              <div
                key={sourceItem.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-foreground/45">
                    <span>{sourceItem.contentType}</span>
                    {sourceItem.authorHandle ? (
                      <span className="normal-case">
                        @{sourceItem.authorHandle}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-sm text-foreground/80">
                    {sourceItem.title || sourceItem.text || 'Untitled'}
                  </div>
                </div>
                {renderSecondaryAction
                  ? renderSecondaryAction(sourceItem)
                  : null}
              </div>
            ))}
          </div>
        ) : null}

        {footerMessage ? (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs text-foreground/45">
            <span>{footerMessage}</span>
            <span>{getTrendPreviewLabel(trend.sourcePreviewState)}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
