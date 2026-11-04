import type { GenerationResponse } from '@genfeedai/contracts/interfaces/content/generation-payload.interface';

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
