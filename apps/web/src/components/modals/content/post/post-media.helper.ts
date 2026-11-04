import {
  IngredientCategory,
  Platform,
  PostCategory,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';

/** Most media one post can carry; Instagram and X carousels top out below it. */
export const MAX_POST_MEDIA_ITEMS = 10;

/** Platforms that publish nothing without a video attached. */
const VIDEO_REQUIRED_PLATFORMS: ReadonlySet<string> = new Set([
  Platform.TIKTOK,
  Platform.YOUTUBE,
]);

/** Platforms that publish text on its own; every other platform needs media. */
const TEXT_ONLY_PLATFORMS: ReadonlySet<string> = new Set([Platform.TWITTER]);

export type PostMediaRequirement = 'none' | 'media' | 'video';

export function getPostMediaUrl(ingredient: IIngredient): string {
  if (ingredient.ingredientUrl) {
    return ingredient.ingredientUrl;
  }

  const collection =
    ingredient.category === IngredientCategory.VIDEO ? 'videos' : 'images';
  return `${EnvironmentService.ingredientsEndpoint}/${collection}/${ingredient.id}`;
}

/** The strictest media need among the selected destinations. */
export function getPostMediaRequirement(
  platforms: readonly string[],
): PostMediaRequirement {
  if (platforms.some((platform) => VIDEO_REQUIRED_PLATFORMS.has(platform))) {
    return 'video';
  }
  if (platforms.some((platform) => !TEXT_ONLY_PLATFORMS.has(platform))) {
    return 'media';
  }
  return 'none';
}

export function isPostMediaRequirementMet(
  requirement: PostMediaRequirement,
  media: readonly IIngredient[],
): boolean {
  if (requirement === 'video') {
    return media.some((item) => item.category === IngredientCategory.VIDEO);
  }
  if (requirement === 'media') {
    return media.length > 0;
  }
  return true;
}

/** Add picked items after the current ones, keeping order and dropping repeats. */
export function mergePostMedia(
  current: readonly IIngredient[],
  picked: readonly IIngredient[],
): IIngredient[] {
  const merged = [...current];
  for (const item of picked) {
    if (!merged.some((existing) => existing.id === item.id)) {
      merged.push(item);
    }
  }
  return merged.slice(0, MAX_POST_MEDIA_ITEMS);
}

const VIDEO_INGREDIENT_CATEGORIES: ReadonlySet<string> = new Set([
  IngredientCategory.AVATAR,
  IngredientCategory.VIDEO,
  IngredientCategory.VIDEO_EDIT,
]);

const IMAGE_INGREDIENT_CATEGORIES: ReadonlySet<string> = new Set([
  IngredientCategory.GIF,
  IngredientCategory.IMAGE,
  IngredientCategory.IMAGE_EDIT,
]);

/**
 * The post category the attached media describes. The API validates a new
 * post's channel contract from its category (the default is TEXT), so a draft
 * with a video must say VIDEO or it is judged as text. `undefined` leaves the
 * server default for a post with no visual media.
 */
export function getPostCategoryForMedia(
  media: readonly IIngredient[],
): PostCategory | undefined {
  if (media.some((item) => VIDEO_INGREDIENT_CATEGORIES.has(item.category))) {
    return PostCategory.VIDEO;
  }
  if (media.some((item) => IMAGE_INGREDIENT_CATEGORIES.has(item.category))) {
    return PostCategory.IMAGE;
  }
  return undefined;
}
