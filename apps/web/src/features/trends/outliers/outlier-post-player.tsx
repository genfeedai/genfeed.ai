'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  formatCompactNumber,
  formatOutlierMultiple,
} from '@helpers/formatting/format/format.helper';
import { Button } from '@ui/primitives/button';
import { ExternalLink, Sparkles } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import SocialMediaPlayer from '@/components/analytics/trends/social-media-player';
import type { OutlierPostPlayerProps } from '@/features/trends/props/trends-outliers.props';

/**
 * The video plays in its platform's own player, with the platform's branding
 * and the creator's name. Genfeed keeps the link and the numbers, never a copy
 * of the video.
 */
export default function OutlierPostPlayer({
  isRemixAvailable,
  onRemix,
  post,
}: OutlierPostPlayerProps) {
  const translate = useTranslations('common.trends.outliers');
  const format = useFormatter();
  const title =
    post.captionExcerpt ||
    translate('videoBy', {
      handle: post.creator.handle,
    });

  return (
    <div className="flex flex-wrap items-start gap-4">
      <SocialMediaPlayer
        className="w-72 max-w-full shrink-0"
        contentType="video"
        isPortrait
        sourceUrl={post.url}
        title={title}
      />
      <div className="min-w-56 flex-1 space-y-3">
        <p className="text-sm font-medium">
          {translate('player.summary', {
            median: formatCompactNumber(post.medianViews),
            multiple: formatOutlierMultiple(post.outlierRatio),
            views: formatCompactNumber(post.views),
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {translate('player.terms', {
            date: format.dateTime(new Date(post.countsReadAt), {
              day: 'numeric',
              month: 'short',
            }),
            platform: translate(`platforms.${post.platform}`),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {isRemixAvailable ? (
            <Button
              icon={<Sparkles className="size-4" />}
              label={translate('remix')}
              onClick={() => onRemix(post)}
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
            />
          ) : null}
          <Button
            asChild
            icon={<ExternalLink className="size-4" />}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <a href={post.url} rel="noopener noreferrer" target="_blank">
              {translate('openOriginal')}
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
