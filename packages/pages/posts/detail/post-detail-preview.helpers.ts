import {
  IngredientCategory,
  PostVisibility,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type {
  ICredential,
  IPost,
  IReleaseMediaReference,
} from '@genfeedai/interfaces';
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
  return post.ingredients.reduce<IReleaseMediaReference[]>(
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
 * As with the review adapter, most `IChannelTarget` fields below are never
 * read by a preview renderer (only `settings.caption`, `platform`, and
 * `attachments` are) — they carry inert defaults purely to satisfy the
 * shared contract's type.
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
      settings: { caption },
      source: ReleaseTargetSource.MANUAL,
      timezone: 'UTC',
      updatedAt: post.updatedAt,
      validationIssues: [],
      validationState: TargetValidationState.PENDING,
      visibility: post.visibility ?? PostVisibility.PUBLIC,
    },
  };
}
