'use client';

import {
  type ChannelCapability,
  type ChannelMediaKind,
  type ChannelPublishMode,
  type ChannelTargetValidationResult,
  type ChannelValidationIssue,
  getChannelCapability,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  validateChannelTargetSettings,
} from '@api-types/contracts';
import {
  ButtonVariant,
  CredentialPlatform,
  IngredientCategory,
  TargetValidationState,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';
import {
  HiArrowPath,
  HiBookmark,
  HiChatBubbleOvalLeft,
  HiHandThumbUp,
  HiHeart,
  HiPaperAirplane,
  HiPlay,
  HiSparkles,
} from 'react-icons/hi2';

export type PlatformPreviewMedia = {
  id: string;
  kind: ChannelMediaKind;
  url?: string;
  thumbnailUrl?: string;
  alt?: string;
  durationLabel?: string;
  isAnimated?: boolean;
};

export type PlatformPreviewAuthor = {
  name?: string;
  handle?: string;
  avatarUrl?: string;
};

export type PlatformPreviewLinkCard = {
  url: string;
  domain?: string;
  title?: string;
  description?: string;
  imageUrl?: string;
};

export type PlatformPreviewThreadSegment = {
  id: string;
  caption: string;
  label?: string;
};

export type PlatformPreviewTarget = {
  platform: CredentialPlatform | string;
  caption: string;
  title?: string;
  author?: PlatformPreviewAuthor;
  media?: PlatformPreviewMedia[];
  settings?: Record<string, unknown>;
  publishMode?: ChannelPublishMode;
  capability?: ChannelCapability;
  validation?: ChannelTargetValidationResult;
  threadSegments?: PlatformPreviewThreadSegment[];
  linkPreview?: PlatformPreviewLinkCard | null;
};

export type PlatformPreviewProps = {
  post?: IPost;
  target?: PlatformPreviewTarget;
  targets?: PlatformPreviewTarget[];
  accountName?: string;
  accountHandle?: string;
  activePlatform?: CredentialPlatform | string;
  className?: string;
  emptyMessage?: string;
};

export type PlatformPreviewRendererProps = {
  target: ResolvedPlatformPreviewTarget;
};

export type PlatformPreviewRenderer =
  ComponentType<PlatformPreviewRendererProps>;

type CaptionPreviewState = {
  count: number;
  maxLength?: number;
  isOverLimit: boolean;
  previewText: string;
};

type ResolvedPlatformPreviewTarget = PlatformPreviewTarget & {
  capability?: ChannelCapability;
  validation: ChannelTargetValidationResult;
  captionState: CaptionPreviewState;
  platformLabel: string;
  media: PlatformPreviewMedia[];
  threadSegments: PlatformPreviewThreadSegment[];
};

const DEFAULT_AUTHOR_NAME = 'Your Account';
const DEFAULT_AUTHOR_HANDLE = 'youraccount';
const ENTITY_PATTERN = /(https?:\/\/[^\s]+|[@#][A-Za-z0-9_]+)/g;

export const PLATFORM_PREVIEW_RENDERERS: Partial<
  Record<CredentialPlatform, PlatformPreviewRenderer>
> = {
  [CredentialPlatform.INSTAGRAM]: InstagramPreviewRenderer,
  [CredentialPlatform.LINKEDIN]: LinkedInPreviewRenderer,
  [CredentialPlatform.TIKTOK]: TikTokPreviewRenderer,
  [CredentialPlatform.TWITTER]: XPreviewRenderer,
  [CredentialPlatform.YOUTUBE]: YouTubePreviewRenderer,
};

export function countPreviewCharacters(text: string): number {
  return Array.from(text).length;
}

export function getCaptionPreviewState(
  caption: string,
  maxLength?: number,
): CaptionPreviewState {
  const characters = Array.from(caption);
  const count = characters.length;

  if (!maxLength || count <= maxLength) {
    return {
      count,
      isOverLimit: false,
      maxLength,
      previewText: caption,
    };
  }

  return {
    count,
    isOverLimit: true,
    maxLength,
    previewText: `${characters.slice(0, maxLength).join('')}...`,
  };
}

export function hasDedicatedPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): boolean {
  const normalizedPlatform = normalizePlatform(platform) as CredentialPlatform;
  return Boolean(PLATFORM_PREVIEW_RENDERERS[normalizedPlatform]);
}

export function getPlatformPreviewRenderer(
  platform: CredentialPlatform | string,
): PlatformPreviewRenderer {
  const normalizedPlatform = normalizePlatform(platform) as CredentialPlatform;
  return (
    PLATFORM_PREVIEW_RENDERERS[normalizedPlatform] ??
    GenericPlatformPreviewRenderer
  );
}

export function resolvePlatformPreviewTarget(
  target: PlatformPreviewTarget,
): ResolvedPlatformPreviewTarget {
  const capability = target.capability ?? getChannelCapability(target.platform);
  const media = target.media ?? [];
  const validation =
    target.validation ?? validatePreviewTarget(target, capability, media);
  const threadSegments =
    target.threadSegments && target.threadSegments.length > 0
      ? target.threadSegments
      : [{ caption: target.caption, id: 'post-1', label: 'Post' }];

  return {
    ...target,
    capability,
    captionState: getCaptionPreviewState(
      target.caption,
      capability?.caption.maxLength,
    ),
    media,
    platformLabel:
      capability?.label ?? getFallbackPlatformLabel(target.platform),
    threadSegments,
    validation,
  };
}

function validatePreviewTarget(
  target: PlatformPreviewTarget,
  capability: ChannelCapability | undefined,
  media: PlatformPreviewMedia[],
): ChannelTargetValidationResult {
  const mediaPayload = media.map((item) => ({ id: item.id, kind: item.kind }));

  if (!target.threadSegments || target.threadSegments.length <= 1) {
    return validateChannelTargetSettings({
      caption: target.caption,
      media: mediaPayload,
      platform: target.platform,
      publishMode: target.publishMode,
      settings: target.settings,
    });
  }

  const segmentResults = target.threadSegments.map((segment) =>
    validateChannelTargetSettings({
      caption: segment.caption,
      media: mediaPayload,
      platform: target.platform,
      publishMode: target.publishMode,
      settings: target.settings,
    }),
  );
  const errors = segmentResults.flatMap((result, index) =>
    result.errors.map((issue) => ({
      ...issue,
      field: `threadSegments.${index}.${issue.field ?? 'caption'}`,
      message: `Post ${index + 1}: ${issue.message}`,
    })),
  );
  const warnings = segmentResults.flatMap((result, index) =>
    result.warnings.map((issue) => ({
      ...issue,
      field: `threadSegments.${index}.${issue.field ?? 'caption'}`,
      message: `Post ${index + 1}: ${issue.message}`,
    })),
  );

  return {
    capability,
    errors,
    platform: target.platform,
    valid: errors.length === 0,
    validationState:
      errors.length > 0
        ? TargetValidationState.INVALID
        : warnings.length > 0
          ? TargetValidationState.WARNING
          : TargetValidationState.VALID,
    warnings,
  };
}

function normalizePlatform(platform: CredentialPlatform | string): string {
  return String(platform).toLowerCase();
}

function getFallbackPlatformLabel(
  platform: CredentialPlatform | string,
): string {
  const normalizedPlatform = normalizePlatform(platform);
  if (normalizedPlatform === CredentialPlatform.TWITTER) {
    return 'X';
  }

  return normalizedPlatform
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPlatformIcon(platform: CredentialPlatform | string) {
  const normalizedPlatform = normalizePlatform(platform);

  if (normalizedPlatform === CredentialPlatform.INSTAGRAM) {
    return FaInstagram;
  }

  if (normalizedPlatform === CredentialPlatform.LINKEDIN) {
    return FaLinkedin;
  }

  if (normalizedPlatform === CredentialPlatform.TIKTOK) {
    return FaTiktok;
  }

  if (normalizedPlatform === CredentialPlatform.YOUTUBE) {
    return FaYoutube;
  }

  return FaXTwitter;
}

function formatHandle(handle?: string): string {
  const normalizedHandle = handle?.trim();
  if (!normalizedHandle) {
    return `@${DEFAULT_AUTHOR_HANDLE}`;
  }

  return normalizedHandle.startsWith('@')
    ? normalizedHandle
    : `@${normalizedHandle}`;
}

function getAuthorName(target: PlatformPreviewTarget): string {
  return target.author?.name?.trim() || DEFAULT_AUTHOR_NAME;
}

function inferMediaKind(ingredient: IIngredient): ChannelMediaKind {
  if (
    ingredient.category === IngredientCategory.VIDEO ||
    ingredient.category === IngredientCategory.VIDEO_EDIT
  ) {
    return 'video';
  }

  if (ingredient.category === IngredientCategory.GIF) {
    return 'image';
  }

  return 'image';
}

function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) {
    return undefined;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function buildMediaFromIngredients(
  ingredients: IIngredient[] | undefined,
): PlatformPreviewMedia[] {
  return (ingredients ?? []).map((ingredient, index) => ({
    alt:
      ingredient.metadataLabel ??
      ingredient.metadataDescription ??
      `Media ${index + 1}`,
    durationLabel: formatDuration(ingredient.metadataDuration),
    id: ingredient.id ?? `media-${index}`,
    isAnimated: ingredient.category === IngredientCategory.GIF,
    kind: inferMediaKind(ingredient),
    thumbnailUrl: ingredient.thumbnailUrl,
    url: ingredient.ingredientUrl,
  }));
}

function buildPostTargets(
  post: IPost,
  accountName: string,
  accountHandle: string,
): PlatformPreviewTarget[] {
  const platforms = post.platform
    ? [post.platform]
    : [...PRODUCTIZED_SCHEDULER_PLATFORMS];
  const media = buildMediaFromIngredients(post.ingredients);
  const children = post.children ?? [];

  return platforms.map((platform) => ({
    author: {
      handle: accountHandle,
      name: accountName,
    },
    caption: post.description ?? '',
    media,
    platform,
    threadSegments:
      children.length > 0
        ? [
            {
              caption: post.description ?? '',
              id: post.id ?? 'post-1',
              label: 'Post 1',
            },
            ...children.map((child, index) => ({
              caption: child.description ?? '',
              id: child.id ?? `reply-${index + 1}`,
              label: `Post ${index + 2}`,
            })),
          ]
        : undefined,
    title: post.label,
  }));
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
    className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
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
        <span key={key} className="font-medium text-primary">
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
        'text-xs',
        state.isOverLimit ? 'text-destructive' : 'text-foreground/45',
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
    return <p className="text-sm text-foreground/35">{emptyMessage}</p>;
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
      className="mt-3 border-t border-white/10 pt-3"
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
    <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/10">
      {target.linkPreview?.imageUrl ? (
        <Image
          src={target.linkPreview.imageUrl}
          alt=""
          width={640}
          height={320}
          className="aspect-[2/1] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[2/1] items-center justify-center bg-muted text-xs text-foreground/45">
          No link preview available
        </div>
      )}
      <div className="grid gap-1 p-3">
        <p className="text-xs uppercase text-foreground/45">{domain}</p>
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
}: {
  item: PlatformPreviewMedia;
  index: number;
  className?: string;
}) {
  const src = item.thumbnailUrl ?? item.url;
  const label = item.kind.replace('_', ' ');

  return (
    <div
      className={cn(
        'relative flex min-h-24 items-center justify-center overflow-hidden rounded-lg bg-muted text-xs text-foreground/50',
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={item.alt ?? `Media ${index + 1}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover"
        />
      ) : (
        <span className="capitalize">{label}</span>
      )}
      {item.kind === 'video' || item.kind === 'short_video' ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
          <HiPlay className="size-6" />
        </span>
      ) : null}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {item.isAnimated ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Animated
          </span>
        ) : null}
        {item.durationLabel ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {item.durationLabel}
          </span>
        ) : null}
      </div>
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
  const maxItems = target.capability?.media.maxItems;
  const visibleMedia = maxItems
    ? target.media.slice(0, maxItems)
    : target.media;
  const overflowCount =
    maxItems && target.media.length > maxItems
      ? target.media.length - maxItems
      : 0;

  if (target.media.length === 0) {
    if ((target.capability?.media.minItems ?? 0) > 0) {
      return (
        <div
          className={cn(
            'mt-3 flex items-center justify-center rounded-lg border border-dashed border-white/15 bg-muted/40 text-sm text-foreground/45',
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
      <div className="mt-3">
        <MediaTile
          item={visibleMedia[0]}
          index={0}
          className="aspect-[9/16] min-h-80"
        />
      </div>
    );
  }

  if (variant === 'video') {
    return (
      <div className="mt-3">
        <MediaTile
          item={visibleMedia[0]}
          index={0}
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
    <div className={cn('mt-3 grid gap-1.5', gridClassName)}>
      {visibleMedia.map((item, index) => (
        <MediaTile
          key={item.id}
          item={item}
          index={index}
          className={variant === 'square' ? 'aspect-square' : 'aspect-video'}
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
  const Icon = getPlatformIcon(target.platform);

  return (
    <article
      aria-label={`${target.platformLabel} platform preview`}
      className={cn(
        'overflow-hidden rounded-lg border border-white/10 bg-background/60',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-foreground/70" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {target.platformLabel}
            </p>
            <p className="truncate text-xs text-foreground/45">
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
      <div className="p-4">{children}</div>
    </article>
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
      <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {target.author?.avatarUrl ? (
          <Image
            src={target.author.avatarUrl}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {authorName}
        </p>
        <p className="truncate text-xs text-foreground/45">
          {handle}
          {meta ? <> · {meta}</> : null}
        </p>
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
                <span className="mt-2 h-full min-h-8 w-px bg-white/10" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/10 p-3">
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
                <p className="text-sm text-foreground/35">
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
        <div className="size-10 shrink-0 rounded-full bg-muted" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {getAuthorName(target)}
              </p>
              <p className="truncate text-xs text-foreground/45">
                {formatHandle(target.author?.handle)}
              </p>
            </div>
            <CharacterCounter state={target.captionState} />
          </div>
          <ThreadSegments target={target} />
          <MediaGrid target={target} />
          <LinkPreviewCard target={target} />
          <div className="mt-4 flex justify-between text-foreground/45">
            <HiChatBubbleOvalLeft className="size-4" />
            <HiArrowPath className="size-4" />
            <HiHeart className="size-4" />
            <HiBookmark className="size-4" />
          </div>
          <ValidationIssues target={target} />
        </div>
      </div>
    </PreviewShell>
  );
}

function LinkedInPreviewRenderer({ target }: PlatformPreviewRendererProps) {
  return (
    <PreviewShell eyebrow="LinkedIn feed preview" target={target}>
      <AuthorRow target={target} meta="Public" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase text-foreground/45">
          Feed post
        </span>
        <CharacterCounter state={target.captionState} />
      </div>
      <div className="mt-2">
        <ThreadSegments target={target} />
      </div>
      <MediaGrid target={target} />
      <LinkPreviewCard target={target} />
      <div className="mt-4 flex items-center gap-5 border-t border-white/10 pt-3 text-xs text-foreground/45">
        <span className="inline-flex items-center gap-1">
          <HiHandThumbUp className="size-4" />
          Like
        </span>
        <span className="inline-flex items-center gap-1">
          <HiChatBubbleOvalLeft className="size-4" />
          Comment
        </span>
        <span className="inline-flex items-center gap-1">
          <HiPaperAirplane className="size-4" />
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
        <HiHeart className="size-5" />
        <HiChatBubbleOvalLeft className="size-5" />
        <HiPaperAirplane className="size-5" />
        <HiBookmark className="ml-auto size-5" />
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
      <div className="relative mx-auto max-w-72 overflow-hidden rounded-lg border border-white/10 bg-black">
        <MediaGrid target={target} variant="vertical" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 text-white">
          <p className="text-sm font-semibold">
            {formatHandle(target.author?.handle)}
          </p>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-5">
            {target.captionState.previewText.trim() ||
              'Draft preview appears here.'}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-white/70">
            <span>{target.platformLabel}</span>
            <span>
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
      <MediaGrid target={target} variant="video" />
      <div className="mt-3">
        <h3 className="line-clamp-2 text-base font-semibold text-foreground">
          {target.title?.trim() || 'Untitled video'}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-foreground/45">
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
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/55">
          <HiSparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              Approximate preview
            </p>
            <CharacterCounter state={target.captionState} />
          </div>
          <div className="mt-2">
            <CaptionText target={target} />
          </div>
          <MediaGrid target={target} />
          <LinkPreviewCard target={target} />
          {target.capability ? (
            <div className="mt-3 grid gap-1 text-xs text-foreground/50">
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
  accountName = DEFAULT_AUTHOR_NAME,
  accountHandle = DEFAULT_AUTHOR_HANDLE,
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

    return previewTargets.map(resolvePlatformPreviewTarget);
  }, [accountHandle, accountName, post, target, targets]);

  const [selectedPlatform, setSelectedPlatform] = useState<string>(() =>
    normalizePlatform(activePlatform ?? resolvedTargets[0]?.platform ?? ''),
  );

  useEffect(() => {
    if (resolvedTargets.length === 0) {
      return;
    }

    const activeKey = activePlatform
      ? normalizePlatform(activePlatform)
      : selectedPlatform;
    const hasActiveTarget = resolvedTargets.some(
      (item) => normalizePlatform(item.platform) === activeKey,
    );

    if (!hasActiveTarget || activePlatform) {
      setSelectedPlatform(
        normalizePlatform(activePlatform ?? resolvedTargets[0].platform),
      );
    }
  }, [activePlatform, resolvedTargets, selectedPlatform]);

  if (resolvedTargets.length === 0) {
    return (
      <section
        className={cn('rounded-lg border border-white/10 p-4', className)}
      >
        <p className="text-sm text-foreground/45">{emptyMessage}</p>
      </section>
    );
  }

  const activeTarget =
    resolvedTargets.find(
      (item) => normalizePlatform(item.platform) === selectedPlatform,
    ) ?? resolvedTargets[0];
  const Renderer = getPlatformPreviewRenderer(activeTarget.platform);

  return (
    <section
      className={cn('space-y-4', className)}
      aria-label="Platform preview"
    >
      {resolvedTargets.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {resolvedTargets.map((item) => {
            const itemKey = normalizePlatform(item.platform);
            const Icon = getPlatformIcon(item.platform);
            const isSelected =
              itemKey === normalizePlatform(activeTarget.platform);

            return (
              <Button
                key={itemKey}
                type="button"
                withWrapper={false}
                variant={ButtonVariant.UNSTYLED}
                aria-pressed={isSelected}
                onClick={() => setSelectedPlatform(itemKey)}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium transition',
                  isSelected
                    ? 'border-primary/35 bg-primary/10 text-primary'
                    : 'border-white/10 text-foreground/55 hover:bg-white/[0.04] hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {item.platformLabel}
              </Button>
            );
          })}
        </div>
      ) : null}

      <Renderer target={activeTarget} />
    </section>
  );
}
