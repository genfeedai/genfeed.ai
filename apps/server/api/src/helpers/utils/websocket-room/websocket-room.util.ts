import { categoryToPlural, IngredientCategory } from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';

/** Calculates the WebSocket user room identifier. */
export function getUserRoom(userId?: string): string | undefined {
  return userId ? getUserRoomName(userId) : undefined;
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

/** Validates that a room can be determined from the canonical user ID. */
export function validateRoomMatch(userId?: string): {
  isValid: boolean;
  warning?: string;
} {
  if (userId) {
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
