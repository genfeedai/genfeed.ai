const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

/**
 * IngredientFilterUtil - Utility for building consistent ingredient query filters
 *
 * Eliminates duplicate filter logic across ingredient controllers (videos, images, organizations, etc.)
 * Provides reusable filter builders for common ingredient query patterns.
 *
 * @example
 * // Build parent filter conditions
 * const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);
 *
 * // Build format filter pipeline stage
 * const formatStage = IngredientFilterUtil.buildFormatFilterStage(query.format);
 *
 * // Use in aggregation pipeline
 * const aggregate: Record<string, unknown>[] = [
 *   { $match: { ...matchStage, ...parentConditions } },
 *   { $lookup: { ... } }, // metadata lookup
 *   ...formatStage,
 *   { $sort: { ... } }
 * ];
 */
export class IngredientFilterUtil {
  /**
   * Build parent filter conditions
   *
   * Handles filtering by parent ingredient ID:
   * - null/'null' → root ingredients only (parent doesn't exist)
   * - valid ObjectId → ingredients with that parent
   * - undefined → returns empty object (no filter, shows both parents and children)
   *
   * @param parent - Parent ID from query params
   * @returns Filter conditions for parent field
   */
  static buildParentFilter(
    parent: string | null | undefined,
  ): Record<string, unknown> {
    // Check if parent parameter is explicitly provided in query
    const hasParentParam = parent !== undefined;

    if (hasParentParam) {
      if (parent === null || parent === 'null' || parent === '') {
        // Explicitly requesting root ingredients
        return { parent: { $exists: false } };
      } else if (isValidObjectId(parent)) {
        // Valid parent ID provided
        return { parent: parent };
      } else {
        // Invalid parent ID, default to root ingredients
        return { parent: { $exists: false } };
      }
    }

    // No parent parameter provided - show BOTH parents and children
    return {};
  }

  /**
   * Build folder filter conditions
   *
   * Handles filtering by folder ID:
   * - null/'null'/'' → root level (no folder)
   * - valid ObjectId → ingredients in that folder
   * - undefined → defaults to root level
   *
   * @param folder - Folder ID from query params
   * @returns Filter conditions for folder field
   */
  static buildFolderFilter(
    folder: string | null | undefined,
  ): Record<string, unknown> {
    const hasFolderParam = folder !== undefined;

    if (hasFolderParam) {
      if (isValidObjectId(folder)) {
        return { folder: folder };
      } else {
        // null, 'null', '' or invalid ID → no folder
        return { folder: { $exists: false } };
      }
    }

    // Default to root level (no folder)
    return { folder: { $exists: false } };
  }

  /**
   * Build training filter conditions
   *
   * Handles filtering by training ID:
   * - valid ObjectId → ingredients for that training
   * - undefined → exclude training ingredients
   *
   * @param training - Training ID from query params
   * @returns Filter conditions for training field
   */
  static buildTrainingFilter(
    training: string | undefined,
  ): Record<string, unknown> {
    if (training) {
      if (isValidObjectId(training)) {
        // Show only ingredients with this specific training
        return { training: training };
      } else {
        // Invalid training ID - exclude training ingredients
        return { training: { $exists: false } };
      }
    }

    // Default: exclude training ingredients
    return { training: { $exists: false } };
  }

  /**
   * Build format filter pipeline stage
   *
   * IMPORTANT: This must be applied AFTER metadata lookup, since it compares
   * metadata.width and metadata.height fields.
   *
   * Format options:
   * - 'square' → width === height
   * - 'landscape' → width > height
   * - 'portrait' → width < height
   *
   * @param format - Format filter from query params
   * @returns Array of pipeline stages (empty if no format specified)
   */
  static buildFormatFilterStage(format?: string): Record<string, unknown>[] {
    if (!format || format === '') {
      return [];
    }

    const formatMatch: Record<string, unknown> =
      format === 'square'
        ? { $expr: { $eq: ['$metadata.width', '$metadata.height'] } }
        : format === 'landscape'
          ? { $expr: { $gt: ['$metadata.width', '$metadata.height'] } }
          : format === 'portrait'
            ? { $expr: { $lt: ['$metadata.width', '$metadata.height'] } }
            : {};

    // Return empty array if format not recognized
    if (Object.keys(formatMatch).length === 0) {
      return [];
    }

    return [{ $match: formatMatch }];
  }

  /**
   * Build brand filter condition
   *
   * Handles filtering by brand ID:
   * - valid ObjectId → specific brand
   * - undefined → any brand (exists)
   *
   * @param brand - Brand ID from query params
   * @returns Filter value for brand field
   */
  static buildBrandFilter(
    brand: string | undefined,
  ): string | Record<string, boolean> {
    if (isValidObjectId(brand)) {
      return brand;
    }
    return { $exists: true };
  }

  /**
   * Build metadata lookup pipeline stages with model label resolution
   *
   * Standard metadata lookup used across all ingredient controllers.
   * Includes model label resolution from models and trainings collections.
   *
   * Model label resolution order:
   * 1. Look up from 'models' collection by key (standard models like google/imagen-3)
   * 2. Look up from 'trainings' collection by model field (trained models like genfeedai/...)
   * 3. If neither found, modelLabel will be null (frontend falls back to raw model key)
   *
   * @returns Array of pipeline stages for metadata lookup with model label
   */
  static buildMetadataLookup(): Record<string, unknown>[] {
    return [
      // 1. Lookup metadata document
      {
        $lookup: {
          as: 'metadata',
          foreignField: '_id',
          from: 'metadata',
          localField: 'metadata',
        },
      },
      {
        $unwind: {
          path: '$metadata',
          preserveNullAndEmptyArrays: true,
        },
      },

      // 2. Lookup model from 'models' collection by key
      {
        $lookup: {
          as: '_modelData',
          foreignField: 'key',
          from: 'models',
          localField: 'metadata.model',
          pipeline: [{ $project: { _id: 1, key: 1, label: 1 } }],
        },
      },

      // 3. Lookup training from 'trainings' collection by model field
      // Training models have keys like "genfeedai/68b5e9f5...:versionhash"
      {
        $lookup: {
          as: '_trainingData',
          from: 'trainings',
          let: { modelKey: '$metadata.model' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$model', '$$modelKey'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            { $project: { _id: 1, label: 1, model: 1 } },
          ],
        },
      },

      // 4. Compute modelLabel: models collection first, then trainings
      {
        $addFields: {
          'metadata.modelLabel': {
            $cond: {
              else: {
                $cond: {
                  else: null,
                  if: { $gt: [{ $size: '$_trainingData' }, 0] },
                  then: { $arrayElemAt: ['$_trainingData.label', 0] },
                },
              },
              if: { $gt: [{ $size: '$_modelData' }, 0] },
              then: { $arrayElemAt: ['$_modelData.label', 0] },
            },
          },
        },
      },

      // 5. Cleanup temporary lookup fields
      {
        $unset: ['_modelData', '_trainingData'],
      },
    ];
  }

  /**
   * Build prompt lookup pipeline stages
   *
   * Standard prompt lookup used across all ingredient controllers.
   * Optionally can be skipped for lightweight queries.
   *
   * @param lightweight - Whether to skip prompt lookup for performance
   * @returns Array of pipeline stages for prompt lookup (empty if lightweight)
   */
  static buildPromptLookup(lightweight?: boolean): Record<string, unknown>[] {
    if (lightweight) {
      return [];
    }

    return [
      {
        $lookup: {
          as: 'prompt',
          foreignField: '_id',
          from: 'prompts',
          localField: 'prompt',
        },
      },
      {
        $unwind: {
          path: '$prompt',
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Build complete ingredient filter pipeline
   *
   * Combines all common filters into a complete pipeline.
   * Useful for simple ingredient listing endpoints.
   *
   * @param query - Query params containing filter values
   * @param baseMatch - Base match conditions (user, organization, category, etc.)
   * @returns Complete array of pipeline stages
   */
  static buildIngredientPipeline(
    query: {
      parent?: string | null;
      folder?: string | null;
      training?: string;
      format?: string;
      sort?: string;
      lightweight?: boolean;
    },
    baseMatch: Record<string, unknown>,
  ): Record<string, unknown>[] {
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );
    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folder,
    );
    const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
      query.training,
    );

    return [
      {
        $match: {
          $and: [baseMatch, parentConditions, folderConditions, trainingFilter],
        },
      },
      ...IngredientFilterUtil.buildMetadataLookup(),
      ...IngredientFilterUtil.buildFormatFilterStage(query.format),
      ...IngredientFilterUtil.buildPromptLookup(query.lightweight),
    ];
  }
}
