/**
 * Persisted on `Ingredient.generationError` when the stuck-ingredient cron gave
 * up waiting. It is a guess, not a provider verdict, so a late successful
 * callback may still finalize the asset.
 */
export const INGREDIENT_PROCESSING_TIMEOUT_ERROR = 'Processing timed out';
