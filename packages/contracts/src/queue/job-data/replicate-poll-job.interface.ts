import type { IngredientCategory } from '../..';

/** Polling fallback for Replicate jobs when provider callbacks are unavailable. */
export const REPLICATE_POLL_DELAY_MS = 15_000;
export const REPLICATE_POLL_MAX_ATTEMPTS = 40;

export interface ReplicatePollJobData {
  attempt: number;
  category: IngredientCategory;
  externalId: string;
  ingredientId: string;
  organizationId: string;
  outputIndex?: number;
}
