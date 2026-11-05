import {
  IngredientCategory,
  Platform,
  PostVisibility,
  ReleaseTargetSource,
  TargetAnalyticsCapability,
  TargetAnalyticsCollectionState,
  TargetAnalyticsFreshness,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import { displayedYouTubeAudience } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  ICredential,
  IPost,
  IReleaseMediaReference,
} from '@genfeedai/contracts/interfaces';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import type { TargetPreviewProps } from '@/props/ui/previews.props';

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

/**
 * Every attached ingredient counts as media, URL or not: the preview's
 * validation counts items, and a Library asset whose URL is not hydrated is
 * still attached (the editor shows it). The renderer draws a placeholder for
 * an item without a URL.
 */
function buildPostMedia(post: IPost): IReleaseMediaReference[] {
  return (post.ingredients ?? []).map((ingredient, index) => ({
    assetId: ingredient.id,
    kind: resolveIngredientMediaKind(ingredient.category),
    order: index,
    url:
      ingredient.cdnUrl ??
      ingredient.ingredientUrl ??
      ingredient.thumbnailUrl ??
      null,
  }));
}

/**
 * The target settings the preview validates. YouTube's required privacy can
 * live on the post's visibility alone (the composer stores it there), so it
 * is resolved the same way the YouTube settings panel shows it.
 */
function buildPreviewSettings(post: IPost): Record<string, unknown> {
  const settings = post.targetSettings ?? {};
  if (post.platform !== Platform.YOUTUBE) {
    return settings;
  }
  const privacyStatus = displayedYouTubeAudience(
    post.visibility,
    settings.privacyStatus,
  );
  return privacyStatus ? { ...settings, privacyStatus } : settings;
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

  const caption = stripHtmlToPlainText(descriptionDraft || post.description);

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
      settings: buildPreviewSettings(post),
      source: ReleaseTargetSource.MANUAL,
      timezone: 'UTC',
      updatedAt: post.updatedAt,
      validationIssues: [],
      validationState: TargetValidationState.PENDING,
      visibility: post.visibility ?? PostVisibility.PUBLIC,
    },
  };
}
