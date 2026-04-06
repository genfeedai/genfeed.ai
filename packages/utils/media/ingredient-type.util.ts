import { IngredientCategory, IngredientExtension } from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';

const AVATAR_IMAGE_EXTENSIONS = new Set([IngredientExtension.JPG, 'jpeg']);

function getNormalizedMetadataExtension(
  ingredient: IIngredient | null | undefined,
): string | null {
  if (!ingredient) {
    return null;
  }

  const metadata = ingredient.metadata as IMetadata | undefined;
  const extension = ingredient.metadataExtension ?? metadata?.extension;

  return typeof extension === 'string' ? extension.toLowerCase() : null;
}

export function isAvatarIngredient(
  ingredient: IIngredient | null | undefined,
): boolean {
  return ingredient?.category === IngredientCategory.AVATAR;
}

export function isAvatarSourceImageIngredient(
  ingredient: IIngredient | null | undefined,
): boolean {
  return (
    isAvatarIngredient(ingredient) &&
    AVATAR_IMAGE_EXTENSIONS.has(
      getNormalizedMetadataExtension(ingredient) ?? '',
    )
  );
}

export function isAvatarVideoIngredient(
  ingredient: IIngredient | null | undefined,
): boolean {
  return (
    isAvatarIngredient(ingredient) &&
    getNormalizedMetadataExtension(ingredient) === IngredientExtension.MP4
  );
}

export function isVideoIngredient(
  ingredient: IIngredient | null | undefined,
): boolean {
  if (!ingredient) {
    return false;
  }

  return (
    ingredient.category === IngredientCategory.VIDEO ||
    isAvatarVideoIngredient(ingredient)
  );
}

export function isImageIngredient(
  ingredient: IIngredient | null | undefined,
): boolean {
  if (!ingredient) {
    return false;
  }

  return (
    ingredient.category === IngredientCategory.IMAGE ||
    ingredient.category === IngredientCategory.GIF ||
    isAvatarSourceImageIngredient(ingredient)
  );
}

export function getIngredientExtension(ingredient: IIngredient): string {
  if (isVideoIngredient(ingredient)) {
    return 'mp4';
  }
  if (ingredient.category === IngredientCategory.GIF) {
    return 'gif';
  }
  if (isImageIngredient(ingredient)) {
    return 'jpg';
  }
  if (
    ingredient.category === IngredientCategory.MUSIC ||
    ingredient.category === IngredientCategory.VOICE
  ) {
    return 'mp3';
  }
  return 'bin';
}

export function getIngredientDisplayLabel(
  ingredient: IIngredient | null | undefined,
): string {
  if (!ingredient) {
    return '';
  }

  const metadata = ingredient.metadata as IMetadata | undefined;
  return ingredient.metadataLabel ?? metadata?.label ?? ingredient.id;
}
