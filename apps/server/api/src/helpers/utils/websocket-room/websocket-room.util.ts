import { categoryToPlural } from '@api/helpers/utils/category-conversion/category-conversion.util';
import { IngredientCategory } from '@genfeedai/enums';

/**
 * Calculates the WebSocket user room identifier.
 * Falls back to dbUserId-based room if clerkUserId is not available.
 */
export function getUserRoom(
  clerkUserId?: string,
  dbUserId?: string,
): string | undefined {
  if (clerkUserId) {
    return `user-${clerkUserId}`;
  }
  if (dbUserId) {
    return `user-${dbUserId}`;
  }
  return undefined;
}

/**
 * Returns the WebSocket/CDN path for an ingredient.
 * e.g., "/videos/abc123", "/images/def456"
 */
export function getIngredientPath(
  category: IngredientCategory | string,
  ingredientId: string,
): string {
  return `/${categoryToPlural(category)}/${ingredientId}`;
}

/**
 * Returns the cache tag for a category.
 * e.g., "videos", "images", "musics"
 */
export function getCacheTag(category: IngredientCategory | string): string {
  return categoryToPlural(category);
}

/**
 * Validates that a room can be determined and warns about potential mismatches.
 */
export function validateRoomMatch(
  clerkUserId?: string,
  dbUserId?: string,
): { isValid: boolean; warning?: string } {
  if (clerkUserId) {
    return { isValid: true };
  }

  if (dbUserId) {
    return {
      isValid: false,
      warning:
        'Client joins room using Clerk ID from JWT, but backend has no clerkId in DB',
    };
  }

  return {
    isValid: false,
    warning: 'No user ID available for WebSocket room',
  };
}

/**
 * Resolves the effective room for WebSocket publishing.
 * Uses userRoom if available, falls back to userId-based room.
 */
export function resolveRoom(
  userRoom?: string,
  userId?: string,
): string | undefined {
  return userRoom || (userId ? `user-${userId}` : undefined);
}
