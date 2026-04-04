import type { GenerationResponse } from '@cloud/interfaces/content/generation-payload.interface';

/**
 * Extracts pending IDs from generation response (batch or single).
 */
export function resolvePendingIds(response: unknown): string[] {
  if (!response) {
    throw new Error('Generation response is null or undefined');
  }

  const typedResponse = response as GenerationResponse;

  if (
    Array.isArray(typedResponse.pendingIngredientIds) &&
    typedResponse.pendingIngredientIds.length > 0
  ) {
    return typedResponse.pendingIngredientIds;
  }

  const singleId = (typedResponse as { id?: string }).id;
  if (singleId) {
    return [singleId];
  }

  throw new Error('No valid ingredient IDs found in generation response');
}

/**
 * Checks if response contains valid pending IDs.
 */
export function hasValidPendingIds(response: unknown): boolean {
  try {
    const ids = resolvePendingIds(response);
    return ids.length > 0;
  } catch {
    return false;
  }
}
