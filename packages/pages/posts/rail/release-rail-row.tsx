'use client';

import {
  ButtonSize,
  ButtonVariant,
  TargetExecutionState,
} from '@genfeedai/enums';
import {
  getPostsPlatformLabel,
  getPublishingPostHref,
} from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatDateInTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  releaseNextInstant,
  releaseOutcomeSummary,
  targetTone,
  visibleTargets,
} from '@pages/posts/rail/release-rail-row.helpers';
import type { ReleaseRailRowProps } from '@props/publisher/release-rail.props';
import { Badge } from '@ui/primitives/badge';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const DEFAULT_TAG_COLOR = '#64748b';

export default function ReleaseRailRow({
  browserTimezone,
  index,
  isActive,
  onActivate,
  release,
  registerRow,
}: ReleaseRailRowProps) {
  const translate = useTranslations('pages.posts.list.rail');
  const { href } = useOrgUrl();
  const { visible, overflow } = visibleTargets(release.targets);
  const outcome = releaseOutcomeSummary(release);
  const nextInstant = releaseNextInstant(release);
  const thumbnail = release.media?.[0]?.url;
  const tagColor = release.firstTagColor?.trim() || DEFAULT_TAG_COLOR;
  const primaryTargetId = visible[0]?.id ?? release.id;

  return (
    <div
      aria-selected={isActive}
      className={cn(
        'group flex items-stretch gap-3 border-b border-border bg-card px-2 py-2 transition-colors hover:bg-accent focus:outline-none focus-visible:bg-accent',
        isActive && 'bg-accent',
      )}
      data-rail-index={index}
      data-release-id={release.id}
      onClick={onActivate}
      onFocus={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onActivate();
        }
      }}
      ref={registerRow}
      role="option"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: tagColor }}
      />

      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-[10px] text-foreground/40">
        {thumbnail ? (
          <img alt="" className="size-full object-cover" src={thumbnail} />
        ) : (
          translate('noMedia')
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {release.title || translate('open')}
        </p>
        <p className="truncate text-xs text-foreground/55">
          {release.baseContent?.split('\n')[0] || ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {visible.map((target) => {
          const PlatformIcon =
            getPlatformIconComponent(target.platform) ?? ExternalLink;
          return (
            <Badge key={target.id} variant={targetTone(target)}>
              <span className="flex items-center gap-1">
                <PlatformIcon className="size-3" />
                {getPostsPlatformLabel(target.platform)}
              </span>
            </Badge>
          );
        })}
        {overflow > 0 ? (
          <Badge variant="outline">
            {translate('overflow', { count: overflow })}
          </Badge>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs text-foreground/55">
        {outcome.published > 0 ? (
          <span>
            {translate('outcome.published', { count: outcome.published })}
          </span>
        ) : null}
        {outcome.failed > 0 ? (
          <span className="text-destructive">
            {translate('outcome.failed', { count: outcome.failed })}
          </span>
        ) : null}
        {outcome.pending > 0 ? (
          <span>
            {translate('outcome.pending', { count: outcome.pending })}
          </span>
        ) : null}
      </div>

      <div className="w-28 shrink-0 text-right text-xs text-foreground/45">
        {nextInstant
          ? translate('nextAt', {
              time: formatDateInTimezone(nextInstant, browserTimezone, 'short'),
            })
          : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          aria-label={translate('open')}
          className={buttonVariants({
            size: ButtonSize.ICON,
            variant: ButtonVariant.SECONDARY,
          })}
          href={href(getPublishingPostHref(primaryTargetId))}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-4" />
        </Link>
        {visible
          .filter(
            (target) =>
              isSourcePostVariationPlatform(target.platform) &&
              target.executionState === TargetExecutionState.PUBLISHED,
          )
          .map((target) => (
            <Link
              aria-label={translate('open')}
              className={buttonVariants({
                size: ButtonSize.ICON,
                variant: ButtonVariant.SECONDARY,
              })}
              href={href(
                buildSourcePostVariationsHref({
                  platform: target.platform,
                  postId: target.id,
                }),
              )}
              key={target.id}
              onClick={(event) => event.stopPropagation()}
            >
              <Sparkles className="size-4" />
            </Link>
          ))}
      </div>
    </div>
  );
}
