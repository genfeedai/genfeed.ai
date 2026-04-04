import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import { AssetCategory, IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

/**
 * Builds a public reference image URL for a given reference id.
 * Tries Ingredient (image or video with thumbnail) first, then Asset (type: reference).
 */
export async function buildReferenceImageUrl(params: {
  referenceId: string;
  ingredientsService: IngredientsService;
  assetsService: AssetsService;
  configService: ConfigService;
  loggerService?: LoggerService;
}): Promise<string | null> {
  const {
    referenceId,
    ingredientsService,
    assetsService,
    configService,
    loggerService,
  } = params;

  if (!referenceId || referenceId === '') {
    return null;
  }

  try {
    const imageIngredient = await ingredientsService.findOne({
      _id: new Types.ObjectId(referenceId),
      category: IngredientCategory.IMAGE,
      isDeleted: false,
    });

    if (imageIngredient?._id) {
      return `${configService.ingredientsEndpoint}/images/${
        imageIngredient._id
      }`;
    }

    // If not an image, try to find a VIDEO ingredient and use its thumbnail
    const videoIngredient = await ingredientsService.findOne({
      _id: new Types.ObjectId(referenceId),
      category: IngredientCategory.VIDEO,
      isDeleted: false,
    });

    if (videoIngredient?._id) {
      // Use the video's thumbnail as the reference image
      return `${configService.ingredientsEndpoint}/thumbnails/${
        videoIngredient._id
      }`;
    }

    const asset = await assetsService.findOne({
      _id: new Types.ObjectId(referenceId),
      category: AssetCategory.REFERENCE,
      isDeleted: false,
    });

    if (asset?._id) {
      return `${configService.ingredientsEndpoint}/references/${asset._id}`;
    }

    loggerService?.warn('Reference not found or invalid', {
      reference: referenceId,
    });
    return null;
  } catch {
    // Likely invalid ObjectId
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
  referenceIds: string[];
  ingredientsService: IngredientsService;
  assetsService: AssetsService;
  configService: ConfigService;
  loggerService?: LoggerService;
}): Promise<string[]> {
  const {
    referenceIds,
    ingredientsService,
    assetsService,
    configService,
    loggerService,
  } = params;

  if (!Array.isArray(referenceIds) || referenceIds.length === 0) {
    return [];
  }

  const results: string[] = [];
  for (const id of referenceIds) {
    const url = await buildReferenceImageUrl({
      assetsService,
      configService,
      ingredientsService,
      loggerService,
      referenceId: id,
    });
    if (url) {
      results.push(url);
    }
  }
  return results;
}
