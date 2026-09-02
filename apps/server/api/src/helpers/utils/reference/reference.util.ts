import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetCategory, IngredientCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

/**
 * Builds a public reference image URL for a given reference id.
 * Tries Ingredient (image or video with thumbnail) first, then Asset (type: reference).
 * Lookups are tenant-scoped: missing, foreign, and deleted ids all return null.
 */
export async function buildReferenceImageUrl(params: {
  assetsService: AssetsService;
  configService: ConfigService;
  ingredientsService: IngredientsService;
  loggerService?: LoggerService;
  organizationId: string;
  referenceId: string;
}): Promise<string | null> {
  const {
    assetsService,
    configService,
    ingredientsService,
    loggerService,
    organizationId,
    referenceId,
  } = params;

  if (!referenceId || referenceId === '') {
    return null;
  }

  try {
    const imageIngredient = await ingredientsService.findOne({
      category: IngredientCategory.IMAGE,
      id: referenceId,
      isDeleted: false,
      organizationId,
    });

    if (imageIngredient?.id) {
      return `${configService.ingredientsEndpoint}/images/${
        imageIngredient.id
      }`;
    }

    const videoIngredient = await ingredientsService.findOne({
      category: IngredientCategory.VIDEO,
      id: referenceId,
      isDeleted: false,
      organizationId,
    });

    if (videoIngredient?.id) {
      return `${configService.ingredientsEndpoint}/thumbnails/${
        videoIngredient.id
      }`;
    }

    const asset = await assetsService.findOne({
      category: AssetCategory.REFERENCE,
      id: referenceId,
      isDeleted: false,
      organizationId,
    });

    if (asset?.id) {
      return `${configService.cdnUrl}/references/${asset.id}`;
    }

    loggerService?.warn('Reference not found or invalid', {
      reference: referenceId,
    });
    return null;
  } catch {
    loggerService?.warn('Reference lookup failed', {
      reference: referenceId,
    });
    return null;
  }
}

/**
 * Builds an array of public reference image URLs for given reference ids.
 * Filters out invalid/null entries. Returns [] if none found.
 */
export async function buildReferenceImageUrls(params: {
  assetsService: AssetsService;
  configService: ConfigService;
  ingredientsService: IngredientsService;
  loggerService?: LoggerService;
  organizationId: string;
  referenceIds: string[];
}): Promise<string[]> {
  const {
    assetsService,
    configService,
    ingredientsService,
    loggerService,
    organizationId,
    referenceIds,
  } = params;

  if (!Array.isArray(referenceIds) || referenceIds.length === 0) {
    return [];
  }

  const lookups = new Map<string, Promise<string | null>>();
  const results = await Promise.all(
    referenceIds.map((referenceId) => {
      const existing = lookups.get(referenceId);
      if (existing) {
        return existing;
      }

      const lookup = buildReferenceImageUrl({
        assetsService,
        configService,
        ingredientsService,
        loggerService,
        organizationId,
        referenceId,
      });
      lookups.set(referenceId, lookup);
      return lookup;
    }),
  );

  return results.filter((url): url is string => url !== null);
}
