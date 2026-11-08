import {
  IngredientCategory,
  IngredientStatus,
  PostCategory,
} from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';

/** `CreatePostDto.ingredients` accepts 35 at most (the TikTok limit). */
const MAX_DRAFT_MEDIA_ITEMS = 35;

/** Canonical Library media URL: `<ingredients endpoint>/<images|videos|gifs>/<id>`. */
const LIBRARY_MEDIA_URL_ID = /\/(?:images|videos|gifs)\/([^/?#]+)(?:[/?#]|$)/i;

const READY_STATUSES: readonly string[] = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

const IMAGE_CATEGORIES: readonly string[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.GIF,
];

export interface DraftMediaIngredient {
  brandId?: string | null;
  category?: string;
  id?: string;
  status?: string;
}

export interface DraftMediaLookup {
  findOne(where: {
    id: string;
    isDeleted: false;
    organizationId: string;
  }): Promise<unknown>;
}

export type DraftMediaResolution =
  | { ingredientIds: string[]; category?: PostCategory; error?: undefined }
  | { error: string };

/** The Library asset id carried by a hosted media URL, if it has one. */
export function readLibraryMediaId(url: string): string | undefined {
  return url.match(LIBRARY_MEDIA_URL_ID)?.[1];
}

function readUrlList(value: unknown): string[] | { error: string } {
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    return { error: 'mediaUrls must be a list of non-empty URLs.' };
  }
  return value.map((entry) => (entry as string).trim());
}

function readPlatformLimitError(
  platforms: readonly string[],
  count: number,
): string | undefined {
  if (count < 2) {
    return undefined;
  }
  for (const platform of platforms) {
    const capability = getChannelCapability(platform);
    const images = capability?.media.images;
    if (!capability || !images) {
      continue;
    }
    const min = Math.max(2, images.minItems);
    if (count < min || count > images.maxItems) {
      return `${capability.label} carousels take ${min}-${images.maxItems} images, but mediaUrls has ${count}.`;
    }
  }
  return undefined;
}

/**
 * Resolves `create_post` `mediaUrls` to Library ingredient ids, in the order
 * given, so a carousel keeps its slide order. A URL that is not a Library
 * asset of the caller's organization and brand fails the call instead of
 * being dropped, so a draft never saves without the media the caller sent.
 */
export async function resolveDraftMediaUrls(input: {
  brandId?: string;
  ingredients: DraftMediaLookup | undefined;
  organizationId: string;
  platforms: readonly string[];
  value: unknown;
}): Promise<DraftMediaResolution> {
  const urls = readUrlList(input.value);
  if (!Array.isArray(urls)) {
    return urls;
  }
  if (urls.length === 0) {
    return { ingredientIds: [] };
  }
  if (urls.length > MAX_DRAFT_MEDIA_ITEMS) {
    return {
      error: `mediaUrls takes at most ${MAX_DRAFT_MEDIA_ITEMS} items, got ${urls.length}.`,
    };
  }
  const limitError = readPlatformLimitError(input.platforms, urls.length);
  if (limitError) {
    return { error: limitError };
  }
  if (!input.ingredients) {
    return {
      error: 'Media lookup is unavailable, so mediaUrls cannot be attached.',
    };
  }

  const ingredientIds: string[] = [];
  const categories = new Set<string>();
  for (const url of urls) {
    const id = readLibraryMediaId(url);
    if (!id) {
      return {
        error: `mediaUrls entry ${url} is not a Library asset URL. Upload it with upload_media and pass the returned url.`,
      };
    }
    if (ingredientIds.includes(id)) {
      return { error: `mediaUrls lists ${url} more than once.` };
    }
    const found = (await input.ingredients.findOne({
      id,
      isDeleted: false,
      organizationId: input.organizationId,
    })) as DraftMediaIngredient | null;
    if (!found) {
      return { error: `mediaUrls entry ${url} was not found in the Library.` };
    }
    if (input.brandId && found.brandId && found.brandId !== input.brandId) {
      return {
        error: `mediaUrls entry ${url} belongs to a different brand than this draft.`,
      };
    }
    if (found.status && !READY_STATUSES.includes(found.status)) {
      return {
        error: `mediaUrls entry ${url} is not ready yet (status ${found.status.toLowerCase()}). Complete the upload or wait for generation first.`,
      };
    }
    const category = found.category ?? '';
    if (
      !IMAGE_CATEGORIES.includes(category) &&
      category !== IngredientCategory.VIDEO
    ) {
      return {
        error: `mediaUrls entry ${url} is not an image or video.`,
      };
    }
    categories.add(IMAGE_CATEGORIES.includes(category) ? 'image' : 'video');
    ingredientIds.push(id);
  }

  if (categories.size > 1 || (categories.has('video') && urls.length > 1)) {
    return {
      error:
        'A draft takes one video or any number of images, not a mix of images and video.',
    };
  }

  return {
    category: categories.has('video') ? PostCategory.VIDEO : PostCategory.IMAGE,
    ingredientIds,
  };
}
