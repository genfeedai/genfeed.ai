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
  /**
   * Reference images of characters granted to the caller (#6037), by the
   * organization that owns them. Only an admitted grant puts an id here, so
   * the lookup stays scoped to one explicit organization.
   */
  grantedOwners?: ReadonlyMap<string, string>;
  ingredientsService: IngredientsService;
  loggerService?: LoggerService;
  organizationId: string;
  referenceId: string;
}): Promise<string | null> {
  const {
    assetsService,
    configService,
    grantedOwners,
    ingredientsService,
    loggerService,
    referenceId,
  } = params;
  const organizationId =
    grantedOwners?.get(referenceId) ?? params.organizationId;

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

    const brandVisualCategories = [
      { category: AssetCategory.REFERENCE, path: 'references' },
      { category: AssetCategory.LOGO, path: 'logos' },
      { category: AssetCategory.BANNER, path: 'banners' },
    ] as const;

    for (const { category, path } of brandVisualCategories) {
      const asset = await assetsService.findOne({
        category,
        id: referenceId,
        isDeleted: false,
        organizationId,
      });

      if (asset?.id) {
        return `${configService.cdnUrl}/${path}/${asset.id}`;
      }
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
  grantedOwners?: ReadonlyMap<string, string>;
  ingredientsService: IngredientsService;
  loggerService?: LoggerService;
  organizationId: string;
  referenceIds: string[];
}): Promise<string[]> {
  const {
    assetsService,
    configService,
    grantedOwners,
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
        grantedOwners,
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
