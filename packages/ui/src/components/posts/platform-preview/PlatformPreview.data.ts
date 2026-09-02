import {
  type CredentialPlatform,
  formatPlatformLabel,
  IngredientCategory,
  parsePlatform,
  TargetValidationState,
} from '@genfeedai/contracts';
import {
  type ChannelCapability,
  type ChannelMediaKind,
  type ChannelTargetValidationResult,
  getChannelCapability,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  validateChannelTargetSettings,
} from '@genfeedai/contracts/api-types/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';

import type {
  CaptionPreviewState,
  PlatformPreviewMedia,
  PlatformPreviewTarget,
  ResolvedPlatformPreviewTarget,
} from './PlatformPreview.types';

export const DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME = 'Your Account';
export const DEFAULT_PLATFORM_PREVIEW_AUTHOR_HANDLE = 'youraccount';

/**
 * Aliases such as `x` and `meta` reach the preview from stored drafts and MCP
 * payloads. `parsePlatform` is the shared canonicaliser, so routing, capability
 * lookup, and validation all agree on which channel is being previewed.
 * `CredentialPlatform` is a re-export of `Platform`, so no widening is needed.
 */
export function resolvePreviewPlatform(
  platform: CredentialPlatform | string,
): CredentialPlatform | undefined {
  return parsePlatform(platform);
}

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
export function getPlatformKey(platform: CredentialPlatform | string): string {
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

export function buildPostTargets(
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
