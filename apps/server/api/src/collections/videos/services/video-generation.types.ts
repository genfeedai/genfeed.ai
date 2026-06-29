/**
 * Internal types for VideoGenerationService.
 * Extracted per repo rule: no inline interfaces in service files.
 */

export type PromptInput = Record<string, unknown> & {
  prompt?: string;
  resolution?: string;
};

/**
 * Parameters passed to the single provider-dispatch helper. The same shape is
 * reused for the first output and every additional output, so provider routing
 * lives in exactly one place.
 */
export interface DispatchVideoGenerationParams {
  duration?: number;
  height: number;
  imageUrl?: string;
  model: string;
  prompt: string;
  promptParams: Record<string, unknown>;
  width: number;
}

export interface CreateVideoPlaceholderActivityParams {
  brandId: string;
  authProviderUserId: string;
  ingredientId: string;
  model: string;
  organization: string;
  user: string;
}
