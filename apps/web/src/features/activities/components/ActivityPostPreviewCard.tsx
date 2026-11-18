'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
  CardVariant,
  isPlatform,
} from '@genfeedai/contracts';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import Card from '@ui/card/Card';
import { Avatar } from '@ui/primitives/avatar';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ActivityPostPreviewCardProps } from '@/features/activities/props/activity-post-preview-card.props';

function formatPublishedDate(value: string | undefined): string | undefined {
  if (!value || !Number.isFinite(new Date(value).getTime())) return undefined;
  return new Date(value).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  });
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    notation: 'compact',
  }).format(value);
}

function Metric({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <SimpleTooltip label={label}>
      <span className="flex items-center gap-1">
        {icon}
        <span aria-hidden="true">{children}</span>
        <span className="sr-only">{label}</span>
      </span>
    </SimpleTooltip>
  );
}

/**
 * The post an activity is about: who posted it, what it said, how it did, and
 * the way to its source. Shown in the activity detail and in the row's hover
 * card, so a breakout is readable without opening the network.
 */
export default function ActivityPostPreviewCard({
  preview,
  remixHref,
}: ActivityPostPreviewCardProps) {
  const translate = useTranslations('pages.activities');
  const platformLabel = isPlatform(preview.platform)
    ? getPostsPlatformLabel(preview.platform)
    : preview.platform;
  const viewLabel = translate('detailViewOnNetwork', {
    platform: platformLabel,
  });
  const publishedDate = formatPublishedDate(preview.publishedAt);
  const { metrics } = preview;

  return (
    <Card
      data-testid="activity-post-preview"
      gap={CardGap.MD}
      padding={CardPadding.SM}
      variant={CardVariant.INSET}
    >
      <div className="flex items-center gap-2">
        <Avatar
          name={preview.authorName ?? preview.authorHandle}
          src={preview.authorAvatarUrl}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {preview.authorName ?? platformLabel}
          </span>
          {preview.authorHandle ? (
            <span className="truncate text-xs text-muted-foreground">
              @{preview.authorHandle}
            </span>
          ) : null}
        </div>
        {preview.ratio ? (
          <Badge className="ml-auto shrink-0" variant="success">
            {translate('previewRatio', { ratio: preview.ratio.toFixed(1) })}
          </Badge>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {preview.text}
      </p>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {metrics?.replies !== undefined ? (
          <Metric
            icon={<MessageCircle className="size-3.5" />}
            label={translate('previewReplies', { count: metrics.replies })}
          >
            {formatCount(metrics.replies)}
          </Metric>
        ) : null}
        {metrics?.reposts !== undefined ? (
          <Metric
            icon={<Repeat2 className="size-3.5" />}
            label={translate('previewReposts', { count: metrics.reposts })}
          >
            {formatCount(metrics.reposts)}
          </Metric>
        ) : null}
        {metrics?.likes !== undefined ? (
          <Metric
            icon={<Heart className="size-3.5" />}
            label={translate('previewLikes', { count: metrics.likes })}
          >
            {formatCount(metrics.likes)}
          </Metric>
        ) : null}
        {metrics?.views !== undefined ? (
          <Metric
            icon={<Eye className="size-3.5" />}
            label={translate('previewViews', { count: metrics.views })}
          >
            {formatCount(metrics.views)}
          </Metric>
        ) : null}
        {publishedDate ? (
          <span className="ml-auto whitespace-nowrap">{publishedDate}</span>
        ) : null}
        {preview.url ? (
          <Button
            asChild
            ariaLabel={viewLabel}
            className={publishedDate ? undefined : 'ml-auto'}
            size={ButtonSize.ICON}
            tooltip={viewLabel}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <a
              aria-label={viewLabel}
              href={preview.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
      </div>

      {remixHref ? (
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
          <Link href={remixHref}>{translate('detailRemix')}</Link>
        </Button>
      ) : null}
    </Card>
  );
}
