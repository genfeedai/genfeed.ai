import { categoryToPlural } from '@api/helpers/utils/category-conversion/category-conversion.util';
import { IngredientCategory } from '@genfeedai/enums';
import { getUserRoomName } from '@libs/websockets/room-name.util';

/**
 * Calculates the WebSocket user room identifier.
 * Falls back to dbUserId-based room if the compatibility ID is not available.
 */
export function getUserRoom(
  authProviderUserId?: string,
  dbUserId?: string,
): string | undefined {
  if (authProviderUserId) {
    return getUserRoomName(authProviderUserId);
  }
  if (dbUserId) {
    return getUserRoomName(dbUserId);
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
 * Validates that a room can be determined from either canonical ID.
 */
export function validateRoomMatch(
  authProviderUserId?: string,
  dbUserId?: string,
): { isValid: boolean; warning?: string } {
  if (authProviderUserId) {
    return { isValid: true };
  }

  if (dbUserId) {
    return { isValid: true };
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
  return userRoom || (userId ? getUserRoomName(userId) : undefined);
}
