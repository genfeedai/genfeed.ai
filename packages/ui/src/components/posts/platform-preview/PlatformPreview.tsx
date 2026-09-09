'use client';

import {
  ButtonVariant,
  CredentialPlatform,
  TargetValidationState,
} from '@genfeedai/contracts';
import type { ChannelValidationIssue } from '@genfeedai/contracts/api-types/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants/platform-limits.constant';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  MediumIcon,
  PinterestIcon,
  RedditIcon,
  ThreadsIcon,
  TiktokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@genfeedai/helpers/ui/icons/brands';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import {
  Bookmark,
  Globe,
  Heart,
  MessageCircle,
  Play,
  RefreshCw,
  Send,
  ThumbsUp,
} from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  buildPostTargets,
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE,
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME,
  getCaptionPreviewState,
  getPlatformKey,
  resolvePlatformPreviewTarget,
  resolvePreviewPlatform,
} from './PlatformPreview.data';
import type {
  CaptionPreviewState,
  PlatformPreviewIcon,
  PlatformPreviewMedia,
  PlatformPreviewProps,
  PlatformPreviewRenderer,
  PlatformPreviewRendererProps,
  PlatformPreviewTarget,
  ResolvedPlatformPreviewTarget,
} from './PlatformPreview.types';

export {
  buildMediaFromIngredients,
  countPreviewCharacters,
  getCaptionPreviewState,
  resolvePlatformPreviewTarget,
} from './PlatformPreview.data';
export type {
  PlatformPreviewAuthor,
  PlatformPreviewIcon,
  PlatformPreviewLinkCard,
  PlatformPreviewMedia,
  PlatformPreviewProps,
  PlatformPreviewRenderer,
  PlatformPreviewRendererProps,
  PlatformPreviewTarget,
  PlatformPreviewThreadSegment,
} from './PlatformPreview.types';

const ENTITY_PATTERN = /(https?:\/\/[^\s]+|[@#][A-Za-z0-9_]+)/g;

export const PLATFORM_PREVIEW_RENDERERS: Partial<
  Record<CredentialPlatform, PlatformPreviewRenderer>
> = {
  [CredentialPlatform.INSTAGRAM]: InstagramPreviewRenderer,
  [CredentialPlatform.LINKEDIN]: LinkedInPreviewRenderer,
  [CredentialPlatform.TIKTOK]: TikTokPreviewRenderer,
  [CredentialPlatform.TWITTER]: XPreviewRenderer,
  [CredentialPlatform.THREADS]: ThreadsPreviewRenderer,
  [CredentialPlatform.YOUTUBE]: YouTubePreviewRenderer,
};

/**
 * Brand marks are identity, not decoration: showing the wrong one makes the
 * preview lie about where the post lands. Unmapped platforms get the neutral
 * globe rather than borrowing another network's logo.
 */
export const PLATFORM_PREVIEW_ICONS: Partial<
  Record<CredentialPlatform, PlatformPreviewIcon>
> = {
  [CredentialPlatform.FACEBOOK]: FacebookIcon,
  [CredentialPlatform.INSTAGRAM]: InstagramIcon,
  [CredentialPlatform.LINKEDIN]: LinkedinIcon,
  [CredentialPlatform.MEDIUM]: MediumIcon,
  [CredentialPlatform.PINTEREST]: PinterestIcon,
  [CredentialPlatform.REDDIT]: RedditIcon,
  [CredentialPlatform.THREADS]: ThreadsIcon,
  [CredentialPlatform.TIKTOK]: TiktokIcon,
  [CredentialPlatform.TWITTER]: XTwitterIcon,
  [CredentialPlatform.YOUTUBE]: YoutubeIcon,
};

export const GENERIC_PLATFORM_PREVIEW_ICON: PlatformPreviewIcon = Globe;

export function getPlatformPreviewIcon(
  platform: CredentialPlatform | string,
): PlatformPreviewIcon {
  const resolvedPlatform = resolvePreviewPlatform(platform);

  return resolvedPlatform
    ? (PLATFORM_PREVIEW_ICONS[resolvedPlatform] ??
        GENERIC_PLATFORM_PREVIEW_ICON)
    : GENERIC_PLATFORM_PREVIEW_ICON;
}

export function hasDedicatedPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): boolean {
  const resolvedPlatform = resolvePreviewPlatform(platform);
  return Boolean(
    resolvedPlatform && PLATFORM_PREVIEW_RENDERERS[resolvedPlatform],
  );
}

export function getPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): PlatformPreviewRenderer {
  const resolvedPlatform = resolvePreviewPlatform(platform);

  return (
    (resolvedPlatform && PLATFORM_PREVIEW_RENDERERS[resolvedPlatform]) ||
    GenericPlatformPreviewRenderer
  );
}

/**
 * Returns `undefined` when no handle is known. Substituting a placeholder here
 * paired a real account or brand name with an invented handle; callers render
 * nothing instead.
 */
function formatHandle(handle?: string): string | undefined {
  const normalizedHandle = handle?.trim();
  if (!normalizedHandle) {
    return undefined;
  }

  return normalizedHandle.startsWith('@')
    ? normalizedHandle
    : `@${normalizedHandle}`;
}

function getAuthorName(target: PlatformPreviewTarget): string {
  return target.author?.name?.trim() || DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME;
}

function getPreviewStatus(target: ResolvedPlatformPreviewTarget): {
  label: string;
  className: string;
} {
  if (
    target.validation.validationState === TargetValidationState.INVALID ||
    target.validation.errors.length > 0
  ) {
    return {
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
      label: 'Blocked',
    };
  }

  if (
    target.validation.validationState === TargetValidationState.WARNING ||
    target.validation.warnings.length > 0
  ) {
    return {
      className: 'border-warning/30 bg-warning/10 text-warning',
      label: 'Warnings',
    };
  }

  return {
    className: 'border-success/25 bg-success/10 text-success',
    label: 'Valid',
  };
}

function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
}

function renderCaptionEntities(text: string): ReactNode[] {
  return text.split(ENTITY_PATTERN).map((part, index) => {
    const key = `${part}-${index}`;
    if (part.match(ENTITY_PATTERN)) {
      return (
        <span
          key={key}
          data-testid="preview-entity"
          className="font-medium text-primary"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

function CharacterCounter({ state }: { state: CaptionPreviewState }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        state.isOverLimit ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {state.maxLength ? `${state.count}/${state.maxLength}` : state.count}
    </span>
  );
}

function CaptionText({
  target,
  emptyMessage = 'Draft preview appears here.',
}: {
  target: ResolvedPlatformPreviewTarget;
  emptyMessage?: string;
}) {
  const text = target.captionState.previewText.trim();

  if (!text) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
      {renderCaptionEntities(text)}
    </p>
  );
}

function ValidationIssues({
  target,
}: {
  target: ResolvedPlatformPreviewTarget;
}) {
  const issues: ChannelValidationIssue[] = [
    ...target.validation.errors,
    ...target.validation.warnings,
  ];

  if (issues.length === 0 && !target.captionState.isOverLimit) {
    return null;
  }

  return (
    <div
      className="mt-3 border-t border-border pt-3"
      role={target.validation.errors.length > 0 ? 'alert' : 'status'}
    >
      <ul className="grid gap-1 text-xs text-foreground/65">
        {target.captionState.isOverLimit && target.captionState.maxLength ? (
          <li className="text-destructive">
            Truncated after {target.captionState.maxLength} characters.
          </li>
        ) : null}
        {issues.map((issue) => (
          <li
            key={`${issue.severity}-${issue.code}-${issue.field ?? 'target'}`}
            className={
              issue.severity === 'error' ? 'text-destructive' : 'text-warning'
            }
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkPreviewCard({
  target,
}: {
  target: ResolvedPlatformPreviewTarget;
}) {
  const url = target.linkPreview?.url ?? extractFirstUrl(target.caption);

  if (!url || !target.capability?.media.kinds.includes('link')) {
    return null;
  }

  const domain =
    target.linkPreview?.domain ??
    (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background/10">
      {target.linkPreview?.imageUrl ? (
        <Image
          src={target.linkPreview.imageUrl}
          alt=""
          width={640}
          height={320}
          className="aspect-[2/1] w-full object-cover outline-media"
        />
      ) : (
        <div className="flex aspect-[2/1] items-center justify-center bg-muted text-xs text-muted-foreground">
          No link preview available
        </div>
      )}
      <div className="grid gap-1 p-3">
        <p className="text-xs uppercase text-muted-foreground">{domain}</p>
        <p className="line-clamp-2 text-sm font-medium text-foreground">
          {target.linkPreview?.title ?? 'Link card pending'}
        </p>
        {target.linkPreview?.description ? (
          <p className="line-clamp-2 text-xs text-foreground/60">
            {target.linkPreview.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MediaTile({
  item,
  index,
  className,
  animatedConsequence,
}: {
  item: PlatformPreviewMedia;
  index: number;
  className?: string;
  animatedConsequence?: string;
}) {
  const isVideo = item.kind === 'video' || item.kind === 'short_video';
  const src = item.thumbnailUrl ?? item.url;
  const label = item.kind.replace('_', ' ');
  const consequence = item.isAnimated ? animatedConsequence : undefined;

  return (
    <div
      className={cn(
        'relative flex min-h-24 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs text-muted-foreground',
        consequence ? 'ring-1 ring-warning/50' : undefined,
        className,
      )}
      data-testid={`platform-preview-media-${item.id}`}
    >
      {isVideo && item.url ? (
        <VideoPlayer
          src={item.url}
          thumbnail={item.thumbnailUrl}
          mediaClassName="object-cover"
          ariaLabel={item.alt ?? `Video ${index + 1}`}
        />
      ) : src ? (
        <Image
          src={src}
          alt={item.alt ?? `Media ${index + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover outline-media"
        />
      ) : (
        <span className="capitalize">{label}</span>
      )}
      {isVideo && !item.url ? (
        <span
          className={
            'absolute inset-0 flex items-center justify-center bg-black/20 text-white' /* design-system-allow-content-color -- media overlay */
          }
        >
          <Play className="size-6" />
        </span>
      ) : null}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {item.isAnimated ? (
          <span
            className={
              'rounded bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
            }
          >
            Animated
          </span>
        ) : null}
        {item.durationLabel ? (
          <span
            className={
              'rounded bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
            }
          >
            {item.durationLabel}
          </span>
        ) : null}
      </div>
      {consequence ? (
        <span className="absolute inset-x-0 bottom-0 bg-warning/90 px-2 py-1 text-left text-2xs font-medium leading-tight text-warning-foreground">
          {consequence}
        </span>
      ) : null}
    </div>
  );
}

function MediaGrid({
  target,
  variant = 'grid',
}: {
  target: ResolvedPlatformPreviewTarget;
  variant?: 'grid' | 'square' | 'video' | 'vertical';
}) {
  const platform = resolvePreviewPlatform(target.platform);
  const aspect = platform
    ? getPlatformPreviewLimit(platform)?.mediaAspect
    : undefined;
  const maxItems = target.capability?.media.maxItems;
  const visibleMedia = maxItems
    ? target.media.slice(0, maxItems)
    : target.media;
  const overflowCount =
    maxItems && target.media.length > maxItems
      ? target.media.length - maxItems
      : 0;
  const animated = target.capability?.media.animated;
  const animatedConsequence = animated?.supported
    ? undefined
    : animated?.consequence;

  if (target.media.length === 0) {
    if ((target.capability?.media.minItems ?? 0) > 0) {
      return (
        <div
          className={cn(
            'mt-3 flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground',
            variant === 'vertical' ? 'aspect-[9/16]' : 'aspect-video',
          )}
        >
          Media required
        </div>
      );
    }

    return null;
  }

  if (variant === 'vertical') {
    return (
      <div
        className="mt-3"
        data-testid="preview-media"
        data-media-aspect={aspect}
      >
        <MediaTile
          item={visibleMedia[0]}
          index={0}
          animatedConsequence={animatedConsequence}
          className="aspect-[9/16] min-h-80"
        />
      </div>
    );
  }

  if (variant === 'video') {
    return (
      <div
        className="mt-3"
        data-testid="preview-media"
        data-media-aspect={aspect}
      >
        <MediaTile
          item={visibleMedia[0]}
          index={0}
          animatedConsequence={animatedConsequence}
          className="aspect-video min-h-40"
        />
      </div>
    );
  }

  const gridClassName =
    variant === 'square'
      ? 'grid-cols-1'
      : visibleMedia.length === 1
        ? 'grid-cols-1'
        : 'grid-cols-2';

  return (
    <div
      className={cn('mt-3 grid gap-1.5', gridClassName)}
      data-testid="preview-media"
      data-media-aspect={aspect}
    >
      {visibleMedia.map((item, index) => (
        <MediaTile
          key={item.id}
          item={item}
          index={index}
          animatedConsequence={animatedConsequence}
          className={variant === 'square' ? 'aspect-[4/5]' : 'aspect-video'}
        />
      ))}
      {overflowCount > 0 ? (
        <div className="flex min-h-20 items-center justify-center rounded-lg bg-muted text-xs font-medium text-foreground/70">
          +{overflowCount} more not shown
        </div>
      ) : null}
    </div>
  );
}

function PreviewShell({
  target,
  eyebrow,
  isApproximate = false,
  children,
  className,
}: {
  target: ResolvedPlatformPreviewTarget;
  eyebrow: string;
  isApproximate?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const status = getPreviewStatus(target);
  const Icon = getPlatformPreviewIcon(target.platform);

  return (
    <article
      aria-label={`${target.platformLabel} platform preview`}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-background/60',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-foreground/70" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {target.platformLabel}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isApproximate ? 'Approximate preview' : eyebrow}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>
      <div className="p-4">
        {children}
        {target.firstComment?.trim() ? (
          <div
            className="mt-3 border-t border-border pt-3"
            data-testid="preview-first-comment"
          >
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              First comment
            </p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {renderCaptionEntities(target.firstComment)}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AuthorAvatar({ target }: PlatformPreviewRendererProps) {
  return (
    <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-muted-foreground">
      {target.author?.avatarUrl ? (
        <Image
          src={target.author.avatarUrl}
          alt={`${getAuthorName(target)} profile picture`}
          fill
          sizes="40px"
          className="object-cover outline-media"
        />
      ) : (
        getAuthorName(target).slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function AuthorRow({
  target,
  meta,
}: {
  target: ResolvedPlatformPreviewTarget;
  meta?: ReactNode;
}) {
  const authorName = getAuthorName(target);
  const handle = formatHandle(target.author?.handle);

  return (
    <div className="flex items-center gap-3">
      <AuthorAvatar target={target} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {authorName}
        </p>
        {handle || meta ? (
          <p className="truncate text-xs text-muted-foreground">
            {handle}
            {handle && meta ? <> · </> : null}
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ThreadSegments({ target }: { target: ResolvedPlatformPreviewTarget }) {
  if (target.threadSegments.length <= 1) {
    return <CaptionText target={target} />;
  }

  return (
    <div className="grid gap-3">
      {target.threadSegments.map((segment, index) => {
        const state = getCaptionPreviewState(
          segment.caption,
          target.capability?.caption.maxLength,
        );

        return (
          <div key={segment.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70">
                {index + 1}
              </span>
              {index < target.threadSegments.length - 1 ? (
                <span className="mt-2 h-full min-h-8 w-px bg-border" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-background/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/65">
                  {segment.label ?? `Post ${index + 1}`}
                </span>
                <CharacterCounter state={state} />
              </div>
              {segment.caption.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                  {renderCaptionEntities(state.previewText)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Draft preview appears here.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function XPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="X feed preview" target={target}>
      <div className="flex gap-3">
        <AuthorAvatar target={target} />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {getAuthorName(target)}
              </p>
              {formatHandle(target.author?.handle) ? (
                <p className="truncate text-xs text-muted-foreground">
                  {formatHandle(target.author?.handle)}
                </p>
              ) : null}
            </div>
            <CharacterCounter state={target.captionState} />
          </div>
          <ThreadSegments target={target} />
          <MediaGrid target={target} />
          <LinkPreviewCard target={target} />
          <div className="mt-4 flex justify-between text-muted-foreground">
            <MessageCircle className="size-4" />
            <RefreshCw className="size-4" />
            <Heart className="size-4" />
            <Bookmark className="size-4" />
          </div>
          <ValidationIssues target={target} />
        </div>
      </div>
    </PreviewShell>
  );
}

function ThreadsPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="Threads feed preview" target={target}>
      <AuthorRow target={target} />
      <div className="mt-3">
        <ThreadSegments target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div
        className="mt-4 flex items-center gap-4 text-muted-foreground"
        aria-hidden="true"
      >
        <Heart className="size-4" />
        <MessageCircle className="size-4" />
        <RefreshCw className="size-4" />
        <Send className="size-4" />
      </div>
      <div className="mt-2 flex justify-end">
        <CharacterCounter state={target.captionState} />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

function LinkedInPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="LinkedIn feed preview" target={target}>
      <AuthorRow target={target} meta="Public" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Feed post
        </span>
        <CharacterCounter state={target.captionState} />
      </div>
      <div className="mt-2">
        <ThreadSegments target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div className="mt-4 flex items-center gap-5 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp className="size-4" />
          Like
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-4" />
          Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <Send className="size-4" />
          Send
        </span>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

function InstagramPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="Instagram feed preview" target={target}>
      <AuthorRow target={target} />
      <MediaGrid target={target} variant="square" />
      <div className="mt-3 flex items-center gap-4 text-foreground/70">
        <Heart className="size-5" />
        <MessageCircle className="size-5" />
        <Send className="size-5" />
        <Bookmark className="ml-auto size-5" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
          <span className="font-semibold">{getAuthorName(target)}</span>{' '}
          {target.captionState.previewText.trim()
            ? renderCaptionEntities(target.captionState.previewText)
            : 'Draft preview appears here.'}
        </p>
        <CharacterCounter state={target.captionState} />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

function TikTokPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="TikTok vertical preview" target={target}>
      <AuthorRow target={target} />
      <div
        className={
          'relative mx-auto max-w-72 overflow-hidden rounded-lg border border-border bg-black' /* design-system-allow-content-color -- platform preview */
        }
      >
        <MediaGrid target={target} variant="vertical" />
        <div
          className={
            'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 text-white' /* design-system-allow-content-color -- platform preview */
          }
        >
          <p className="text-sm font-semibold">
            {formatHandle(target.author?.handle) ?? getAuthorName(target)}
          </p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-5">
            {target.captionState.previewText.trim()
              ? renderCaptionEntities(target.captionState.previewText)
              : 'Draft preview appears here.'}
          </p>
          <div
            className={
              'mt-3 flex items-center justify-between text-xs text-white/70' /* design-system-allow-content-color -- platform preview */
            }
          >
            <span>{target.platformLabel}</span>
            <span className="tabular-nums">
              {target.captionState.maxLength
                ? `${target.captionState.count}/${target.captionState.maxLength}`
                : target.captionState.count}
            </span>
          </div>
        </div>
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

function YouTubePreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="YouTube watch preview" target={target}>
      <AuthorRow target={target} />
      <MediaGrid target={target} variant="video" />
      <div className="mt-3">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">
          {target.title?.trim() || 'Untitled video'}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{getAuthorName(target)}</span>
          <CharacterCounter state={target.captionState} />
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-muted/35 p-3">
        <CaptionText
          target={target}
          emptyMessage="Description preview appears here."
        />
      </div>
      <ValidationIssues target={target} />
    </PreviewShell>
  );
}

function GenericPlatformPreviewRenderer({
  target,
}: PlatformPreviewRendererProps) {
  return (
    <PreviewShell
      eyebrow="Generic preview"
      isApproximate={true}
      target={target}
    >
      <div className="flex items-start gap-3">
        <AuthorAvatar target={target} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {getAuthorName(target)}
            </p>
            <CharacterCounter state={target.captionState} />
          </div>
          <div className="mt-2">
            <CaptionText target={target} />
          </div>
          <MediaGrid target={target} />
          <LinkPreviewCard target={target} />
          {target.capability ? (
            <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
              <p>
                Media: {target.capability.media.kinds.join(', ')}
                {target.capability.media.maxItems
                  ? `, up to ${target.capability.media.maxItems} item(s)`
                  : ''}
              </p>
              <p>Status: {target.capability.status}</p>
            </div>
          ) : null}
          <ValidationIssues target={target} />
        </div>
      </div>
    </PreviewShell>
  );
}

export default function PlatformPreview({
  post,
  target,
  targets,
  accountName = DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME,
  accountHandle = DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE,
  activePlatform,
  className,
  emptyMessage = 'No platform preview available.',
}: PlatformPreviewProps) {
  const resolvedTargets = useMemo(() => {
    const previewTargets =
      targets ??
      (target
        ? [target]
        : post
          ? buildPostTargets(post, accountName, accountHandle)
          : []);

    return previewTargets.map((item, index) => ({
      ...resolvePlatformPreviewTarget(item),
      id: item.id ?? `${getPlatformKey(item.platform)}:${index}`,
    }));
  }, [accountHandle, accountName, post, target, targets]);

  const [selectedTargetId, setSelectedTargetId] = useState<string>();

  useEffect(() => {
    const current = resolvedTargets.find(
      (item) => item.id === selectedTargetId,
    );
    const requestedPlatform = activePlatform
      ? getPlatformKey(activePlatform)
      : undefined;
    if (
      current &&
      (!requestedPlatform ||
        getPlatformKey(current.platform) === requestedPlatform)
    )
      return;
    const preferred =
      resolvedTargets.find(
        (item) => getPlatformKey(item.platform) === requestedPlatform,
      ) ?? resolvedTargets[0];
    setSelectedTargetId(preferred?.id);
  }, [activePlatform, resolvedTargets, selectedTargetId]);

  if (resolvedTargets.length === 0) {
    return (
      <section className={cn('rounded-lg border border-border p-4', className)}>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </section>
    );
  }

  const activeTarget =
    resolvedTargets.find((item) => item.id === selectedTargetId) ??
    resolvedTargets[0];
  const Renderer = getPlatformPreviewRenderer(activeTarget.platform);

  return (
    <section
      className={cn('space-y-4', className)}
      aria-label="Platform preview"
    >
      {resolvedTargets.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {resolvedTargets.map((item) => {
            const itemKey = item.id;
            const Icon = getPlatformPreviewIcon(item.platform);
            const isSelected = itemKey === activeTarget.id;
            const hasMultipleAccounts =
              resolvedTargets.filter(
                (candidate) =>
                  getPlatformKey(candidate.platform) ===
                  getPlatformKey(item.platform),
              ).length > 1;

            return (
              <Button
                key={itemKey}
                type="button"
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                aria-pressed={isSelected}
                onClick={() => setSelectedTargetId(itemKey)}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition',
                  isSelected
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-hover hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {item.platformLabel}
                {hasMultipleAccounts ? (
                  <span className="text-muted-foreground">
                    {item.author?.handle
                      ? formatHandle(item.author.handle)
                      : item.author?.name ||
                        `Account ${resolvedTargets.indexOf(item) + 1}`}
                  </span>
                ) : null}
              </Button>
            );
          })}
        </div>
      ) : null}

      <Renderer target={activeTarget} />
    </section>
  );
}
