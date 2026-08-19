'use client';

import {
  type ChannelCapability,
  type ChannelMediaKind,
  type ChannelTargetValidationResult,
  getChannelCapability,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  validateChannelTargetSettings,
} from '@api-types/contracts';
import {
  ButtonVariant,
  type CredentialPlatform,
  formatPlatformLabel,
  IngredientCategory,
  TargetValidationState,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IIngredient, IPost } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE,
  DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME,
  getCaptionPreviewState,
  getPlatformPreviewIcon,
  getPlatformPreviewRenderer,
  resolvePreviewPlatform,
} from './PlatformPreview.renderers';
import type {
  PlatformPreviewMedia,
  PlatformPreviewProps,
  PlatformPreviewTarget,
  ResolvedPlatformPreviewTarget,
} from './PlatformPreview.types';

export {
  countPreviewCharacters,
  GENERIC_PLATFORM_PREVIEW_ICON,
  getCaptionPreviewState,
  getPlatformPreviewIcon,
  getPlatformPreviewRenderer,
  hasDedicatedPlatformPreviewRenderer,
  PLATFORM_PREVIEW_ICONS,
  PLATFORM_PREVIEW_RENDERERS,
} from './PlatformPreview.renderers';
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

export function resolvePlatformPreviewTarget(
  target: PlatformPreviewTarget,
): ResolvedPlatformPreviewTarget {
  const resolvedPlatform = resolvePreviewPlatform(target.platform);
  const capability =
    target.capability ??
    getChannelCapability(resolvedPlatform ?? target.platform);
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
      capability?.label ??
      formatPlatformLabel(target.platform) ??
      String(target.platform),
    threadSegments,
    validation,
  };
}

function validatePreviewTarget(
  target: PlatformPreviewTarget,
  capability: ChannelCapability | undefined,
  media: PlatformPreviewMedia[],
): ChannelTargetValidationResult {
  // `isAnimated` travels with the payload so the shared catalog — not the
  // preview — decides which channels flatten animation.
  const mediaPayload = media.map((item) => ({
    id: item.id,
    isAnimated: item.isAnimated,
    kind: item.kind,
  }));
  const platform = resolvePreviewPlatform(target.platform) ?? target.platform;

  if (!target.threadSegments || target.threadSegments.length <= 1) {
    return validateChannelTargetSettings({
      caption: target.caption,
      media: mediaPayload,
      platform,
      publishMode: target.publishMode,
      settings: target.settings,
    });
  }

  const segmentResults = target.threadSegments.map((segment) =>
    validateChannelTargetSettings({
      caption: segment.caption,
      media: mediaPayload,
      platform,
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
    platform,
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

/**
 * Stable key for tab selection and identity comparison. Aliases collapse onto
 * their canonical platform so `x` and `twitter` are never two tabs.
 */
function getPlatformKey(platform: CredentialPlatform | string): string {
  return (
    resolvePreviewPlatform(platform) ?? String(platform).trim().toLowerCase()
  );
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

export function buildMediaFromIngredients(
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

    return previewTargets.map(resolvePlatformPreviewTarget);
  }, [accountHandle, accountName, post, target, targets]);

  const [selectedPlatform, setSelectedPlatform] = useState<string>(() =>
    getPlatformKey(activePlatform ?? resolvedTargets[0]?.platform ?? ''),
  );

  useEffect(() => {
    if (resolvedTargets.length === 0) {
      return;
    }

    const activeKey = activePlatform
      ? getPlatformKey(activePlatform)
      : selectedPlatform;
    const hasActiveTarget = resolvedTargets.some(
      (item) => getPlatformKey(item.platform) === activeKey,
    );

    if (!hasActiveTarget || activePlatform) {
      setSelectedPlatform(
        getPlatformKey(activePlatform ?? resolvedTargets[0].platform),
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
      (item) => getPlatformKey(item.platform) === selectedPlatform,
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
            const itemKey = getPlatformKey(item.platform);
            const Icon = getPlatformPreviewIcon(item.platform);
            const isSelected =
              itemKey === getPlatformKey(activeTarget.platform);

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
