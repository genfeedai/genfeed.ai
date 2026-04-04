import type { IArticle, IIngredient, IPost } from '@cloud/interfaces';
import type {
  AvatarVoiceOption,
  ProviderVariant,
} from '@cloud/interfaces/studio/studio-generate.interface';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';

export const IMAGE_OR_VIDEO_CATEGORIES = new Set([
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
]);

export function isImageOrVideoCategory(category: IngredientCategory): boolean {
  return IMAGE_OR_VIDEO_CATEGORIES.has(category);
}

export const DEFAULT_INGREDIENT_STATUSES: IngredientStatus[] = [
  IngredientStatus.PROCESSING,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

export function isIngredient(
  item: IIngredient | IArticle | IPost,
): item is IIngredient {
  return (
    !('slug' in item && 'readingTime' in item) &&
    !('platform' in item && 'scheduledDate' in item)
  );
}

export function hasDuration(
  item: IIngredient | { duration?: unknown },
): item is IIngredient & { duration: number } {
  return typeof (item as { duration?: unknown }).duration === 'number';
}

export const PROMPT_STORAGE_KEY = 'studio_promptbar_state';

export function getMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key];
  return typeof value === 'string' ? value : '';
}

export function buildAvatarVoiceOption(
  item: IIngredient | null | undefined,
): AvatarVoiceOption | null {
  if (!item) {
    return null;
  }

  const metadata = item?.metadata ?? {};
  const provider = getMetadataString(metadata, 'provider') || item.provider;
  const descriptionParts = [
    getMetadataString(metadata, 'gender'),
    getMetadataString(metadata, 'language'),
    getMetadataString(metadata, 'accent'),
    getMetadataString(metadata, 'tone'),
    getMetadataString(metadata, 'style'),
  ].filter(Boolean);

  const providerVariant: ProviderVariant =
    provider === 'hedra' ? 'secondary' : 'accent';

  return {
    badge: provider || '',
    badgeVariant: provider ? providerVariant : undefined,
    description: descriptionParts.join(' • ') || provider || '',
    key: item.id,
    label:
      getMetadataString(metadata, 'label') || item.metadataLabel || item.id,
  };
}

export function resolveAvatarPreviewUrl(
  avatar: IIngredient | null | undefined,
): string | undefined {
  if (!avatar) {
    return undefined;
  }

  const metadata = (avatar?.metadata ?? {}) as Record<string, unknown>;
  const previewKeys = ['preview', 'thumbnail', 'image', 'cover', 'poster'];

  for (const key of previewKeys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return avatar.thumbnailUrl || avatar.ingredientUrl;
}

export function formatDuration(duration?: number | null): string | null {
  if (duration === undefined || duration === null || Number.isNaN(duration)) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.round(duration));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
