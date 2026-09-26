import {
  IngredientCategory,
  PostVisibility,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  ICredential,
  IPost,
  IReleaseMediaReference,
} from '@genfeedai/contracts/interfaces';
import type { TargetPreviewProps } from '@genfeedai/props/ui/previews.props';

function stripHtml(value?: string): string {
  return (value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveIngredientMediaKind(
  category: IngredientCategory | undefined,
): string {
  switch (category) {
    case IngredientCategory.VIDEO:
    case IngredientCategory.VIDEO_EDIT:
      return 'video';
    case IngredientCategory.GIF:
      return 'gif';
    default:
      return 'image';
  }
}

function buildPostMedia(post: IPost): IReleaseMediaReference[] {
  return (post.ingredients ?? []).reduce<IReleaseMediaReference[]>(
    (media, ingredient, index) => {
      const url =
        ingredient.cdnUrl ??
        ingredient.ingredientUrl ??
        ingredient.thumbnailUrl;
      if (!url) {
        return media;
      }

      media.push({
        assetId: ingredient.id,
        kind: resolveIngredientMediaKind(ingredient.category),
        order: index,
        url,
      });
      return media;
    },
    [],
  );
}

/**
 * Live preview contract for the post-editor sidebar: the same post being
 * edited, rendered through the shared per-platform preview renderers.
 * Returns `null` when the post has no resolved platform — the editor has
 * nothing to preview against yet.
 *
 * Caption lives on the release `baseContent`. X does not declare a `caption`
 * setting, so stuffing the body into `settings.caption` marks the preview
 * blocked even when the tweet itself is valid.
 */
export function buildPostTargetPreview(
  post: IPost,
  descriptionDraft: string,
  credential: ICredential | undefined,
): TargetPreviewProps | null {
  if (!post.platform) {
    return null;
  }

  const caption = stripHtml(descriptionDraft || post.description);

  return {
    credential: credential ?? {
      externalAvatar: null,
      externalHandle: undefined,
      externalName: undefined,
      label: undefined,
      platform: post.platform,
    },
    release: {
      attachments: [],
      baseContent: caption,
      media: buildPostMedia(post),
      title: post.label?.trim() || caption || 'Untitled post',
    },
    target: {
      analytics: {
        collection: {
          capability: TargetAnalyticsCapability.UNSUPPORTED,
          error: null,
          freshness: TargetAnalyticsFreshness.UNAVAILABLE,
          lastCollectedAt: null,
          requestedAt: null,
          state: TargetAnalyticsCollectionState.PENDING,
        },
        snapshot: null,
        state: 'unavailable',
      },
      attachments: [],
      createdAt: post.createdAt,
      credentialId: post.credentialId ?? '',
      executionState: post.targetExecutionState ?? TargetExecutionState.DRAFT,
      id: `${post.id}-target`,
      isDeleted: post.isDeleted,
      order: 0,
      platform: post.platform,
      releaseId: post.groupId ?? post.id,
      retryCount: 0,
      settings: {},
      source: ReleaseTargetSource.MANUAL,
      timezone: 'UTC',
      updatedAt: post.updatedAt,
      validationIssues: [],
      validationState: TargetValidationState.PENDING,
      visibility: post.visibility ?? PostVisibility.PUBLIC,
    },
  };
}
