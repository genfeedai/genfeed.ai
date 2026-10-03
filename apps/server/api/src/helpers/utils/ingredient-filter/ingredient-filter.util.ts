import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type { IngredientOrigin } from '@genfeedai/contracts';

/**
 * IngredientFilterUtil - Utility for building consistent ingredient query filters
 *
 * Eliminates duplicate filter logic across ingredient controllers (videos, images, organizations, etc.)
 * Provides reusable filter builders for common ingredient query patterns.
 *
 * @example
 * // Build parent filter conditions
 * const parentConditions = IngredientFilterUtil.buildParentFilter(query.parentId);
 *
 */

export const IngredientFilterUtil = {
  /**
   * Build the permanent-origin filter (Library origin axis).
   *
   * - one or more origins → rows whose origin is any of them
   * - none → empty object, so origin never narrows a list nobody filtered
   *
   * `origin` is indexed with `organizationId`, so this stays a cheap predicate
   * on the Library list.
   */
  buildOriginFilter(
    origins: readonly IngredientOrigin[] | undefined,
  ): Record<string, unknown> {
    return origins && origins.length > 0
      ? { origin: { in: [...origins] } }
      : {};
  },

  /**
   * Build the character filter (Library character axis).
   *
   * Takes ids that were already resolved against the brand's character
   * availability, never the raw query.
   *
   * - `undefined` → empty object, so the filter never narrows an unfiltered list
   * - ids → rows linked to any of them
   * - `[]` → matches nothing (every requested character was unavailable)
   */
  buildCharacterFilter(
    availableCharacterIds: readonly string[] | undefined,
  ): Record<string, unknown> {
    return availableCharacterIds
      ? { personaId: { in: [...availableCharacterIds] } }
      : {};
  },

  /**
   * Build parent filter conditions
   *
   * Handles filtering by parent ingredient ID:
   * - null/'null' → root ingredients only (parent doesn't exist)
   * - valid entity id → ingredients with that parent
   * - undefined → returns empty object (no filter, shows both parents and children)
   *
   * @param parentId - Parent ID from query params
   * @returns Filter conditions for parent field
   */
  buildParentFilter(
    parentId: string | null | undefined,
  ): Record<string, unknown> {
    // Check if parent parameter is explicitly provided in query
    const hasParentParam = parentId !== undefined;

    if (hasParentParam) {
      if (parentId === null || parentId === 'null' || parentId === '') {
        // Explicitly requesting root ingredients
        return { parentId: null };
      } else if (isEntityId(parentId)) {
        // Valid parent ID provided
        return { parentId };
      } else {
        // Invalid parent ID, default to root ingredients
        return { parentId: null };
      }
    }

    // No parent parameter provided - show BOTH parents and children
    return {};
  },

  /**
   * Build folder filter conditions
   *
   * Handles filtering by folder ID:
   * - null/'null'/'' → root level (no folder)
   * - valid entity id → ingredients in that folder
   * - undefined → no folder filter ("All Assets")
   *
   * @param folderId - Folder ID from query params
   * @returns Filter conditions for folder field
   */
  buildFolderFilter(
    folderId: string | null | undefined,
  ): Record<string, unknown> {
    const hasFolderParam = folderId !== undefined;

    if (hasFolderParam) {
      if (isEntityId(folderId)) {
        return { folderId };
      } else {
        // null, 'null', '' or invalid ID → no folder
        return { folderId: null };
      }
    }

    // No folder parameter means the Library's "All Assets" view.
    return {};
  },

  /**
   * Build training filter conditions
   *
   * Handles filtering by training ID:
   * - valid entity id → ingredients for that training
   * - undefined → exclude training ingredients
   *
   * @param trainingId - Training ID from query params
   * @returns Filter conditions for training field
   */
  buildTrainingFilter(trainingId: string | undefined): Record<string, unknown> {
    if (trainingId) {
      if (isEntityId(trainingId)) {
        // Show only ingredients with this specific training
        return { trainingId };
      } else {
        // Invalid training ID - exclude training ingredients
        return { trainingId: null };
      }
    }

    // Default: exclude training ingredients
    return { trainingId: null };
  },
};
