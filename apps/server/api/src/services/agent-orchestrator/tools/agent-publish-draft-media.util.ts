import { normalizePublishPlatforms } from '@api/services/agent-orchestrator/tools/agent-publish-target.util';
import {
  IngredientCategory,
  IngredientStatus,
  PostCategory,
} from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { traced } from '@libs/tracing/traced';

/** `CreatePostDto.ingredients` accepts 35 at most (the TikTok limit). */
const MAX_DRAFT_MEDIA_ITEMS = 35;

/**
 * Library media URL: `<ingredients endpoint>/<images|videos|gifs>/<segment>`.
 * The segment is the ingredient id for URLs built from an id, and the storage
 * id for the signed URLs `get_assets` and `get_job_status` hand out (those are
 * built from the asset's `s3Key`, whose last segment is not the ingredient id).
 */
const LIBRARY_MEDIA_URL_ID = /\/(images|videos|gifs)\/([^/?#]+)(?:[/?#]|$)/i;

const READY_STATUSES: readonly string[] = [
  IngredientStatus.UPLOADED,
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

const IMAGE_CATEGORIES: readonly string[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.GIF,
];

interface DraftMediaIngredient {
  brandId?: string | null;
  category?: string;
  id?: string;
  status?: string;
}

export interface DraftMediaLookup {
  findOne(
    where:
      | { id: string; isDeleted: false; organizationId: string }
      | { isDeleted: false; organizationId: string; s3Key: string },
  ): Promise<unknown>;
}

export type DraftMediaResolution =
  | { ingredientIds: string[]; category?: PostCategory; error?: undefined }
  | { error: string };

interface LibraryMediaReference {
  /** The URL segment: an ingredient id or a storage id. */
  segment: string;
  /** The object key the URL was built from, when the URL is a CDN media URL. */
  s3Key: string;
}

/** The Library asset reference carried by a hosted media URL, if it has one. */
function readLibraryMediaReference(
  url: string,
): LibraryMediaReference | undefined {
  const match = url.match(LIBRARY_MEDIA_URL_ID);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  let segment = match[2];
  try {
    segment = decodeURIComponent(segment);
  } catch {
    // A malformed escape is kept as written and fails the lookup below.
  }
  return { s3Key: `ingredients/${match[1].toLowerCase()}/${segment}`, segment };
}

/**
 * Finds the ingredient a media URL names: by ingredient id first, then by the
 * object key the served URL was built from.
 */
async function findLibraryAsset(
  ingredients: DraftMediaLookup,
  reference: LibraryMediaReference,
  organizationId: string,
): Promise<DraftMediaIngredient | null> {
  const byId = (await ingredients.findOne({
    id: reference.segment,
    isDeleted: false,
    organizationId,
  })) as DraftMediaIngredient | null;
  if (byId) {
    return byId;
  }
  return (await ingredients.findOne({
    isDeleted: false,
    organizationId,
    s3Key: reference.s3Key,
  })) as DraftMediaIngredient | null;
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

function readRequestedPlatforms(params: Record<string, unknown>): string[] {
  const targets = Array.isArray(params.targets) ? params.targets : [];
  return normalizePublishPlatforms([
    ...(Array.isArray(params.platforms) ? params.platforms : []),
    ...(typeof params.platform === 'string' ? [params.platform] : []),
    ...targets.map((target) =>
      target && typeof target === 'object'
        ? (target as { platform?: unknown }).platform
        : undefined,
    ),
  ]);
}

/**
 * Resolves `create_post` `mediaUrls` to Library ingredient ids, in the order
 * given, so a carousel keeps its slide order. A URL that is not a Library
 * asset of the caller's organization and brand fails the call instead of
 * being dropped, so a draft never saves without the media the caller sent.
 */
export const resolveDraftMediaUrls = traced(
  'resolveDraftMediaUrls',
  async (input: {
    brandId?: string;
    ingredients: DraftMediaLookup | undefined;
    organizationId: string;
    params: Record<string, unknown>;
  }): Promise<DraftMediaResolution> => {
    const urls = readUrlList(input.params.mediaUrls);
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
    const limitError = readPlatformLimitError(
      readRequestedPlatforms(input.params),
      urls.length,
    );
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
      const reference = readLibraryMediaReference(url);
      if (!reference) {
        return {
          error: `mediaUrls entry ${url} is not a Library asset URL. Upload it to the Library and pass the hosted url.`,
        };
      }
      const found = await findLibraryAsset(
        input.ingredients,
        reference,
        input.organizationId,
      );
      if (!found?.id) {
        return {
          error: `mediaUrls entry ${url} was not found in the Library.`,
        };
      }
      const id = found.id;
      if (ingredientIds.includes(id)) {
        return { error: `mediaUrls lists ${url} more than once.` };
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
      category: categories.has('video')
        ? PostCategory.VIDEO
        : PostCategory.IMAGE,
      ingredientIds,
    };
  },
);
