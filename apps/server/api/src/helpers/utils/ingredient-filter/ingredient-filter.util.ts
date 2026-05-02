import { isEntityId } from '@api/helpers/validation/entity-id.validator';

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
 * const parentConditions = IngredientFilterUtil.buildParentFilter(query.parent);
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
        return { parent: null };
      } else if (isEntityId(parent)) {
        // Valid parent ID provided
        return { parent: parent };
      } else {
        // Invalid parent ID, default to root ingredients
        return { parent: null };
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
      if (isEntityId(folder)) {
        return { folder: folder };
      } else {
        // null, 'null', '' or invalid ID → no folder
        return { folder: null };
      }
    }

    // Default to root level (no folder)
    return { folder: null };
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
      if (isEntityId(training)) {
        // Show only ingredients with this specific training
        return { training: training };
      } else {
        // Invalid training ID - exclude training ingredients
        return { training: null };
      }
    }

    // Default: exclude training ingredients
    return { training: null };
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
    if (isEntityId(brand)) {
      return brand;
    }
    return { not: true };
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
  static buildMetadataLookup(): Record<string, unknown> {
    return { include: { metadata: true } };
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
  static buildPromptLookup(lightweight?: boolean): Record<string, unknown> {
    if (lightweight) {
      return {};
    }

    return { include: { prompt: true } };
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
  static buildIngredientquery(
    query: {
      parent?: string | null;
      folder?: string | null;
      training?: string;
      format?: string;
      sort?: string;
      lightweight?: boolean;
    },
    baseMatch: Record<string, unknown>,
  ): Record<string, unknown> {
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );
    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folder,
    );
    const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
      query.training,
    );

    return {
      where: {
        AND: [baseMatch, parentConditions, folderConditions, trainingFilter],
      },
    };
  }
}
