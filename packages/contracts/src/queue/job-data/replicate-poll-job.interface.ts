import type { IngredientCategory } from '../..';

/** Polling fallback for Replicate jobs when provider callbacks are unavailable. */
export const REPLICATE_POLL_DELAY_MS = 15_000;
export const REPLICATE_POLL_MAX_ATTEMPTS = 40;

export interface ReplicatePollJobData {
  attempt: number;
  category: IngredientCategory;
  externalId: string;
  ingredientId: string;
  /**
   * The prediction was created with the organization's own Replicate key
   * (BYOK). Polling must re-resolve that key; the platform key cannot read a
   * prediction that belongs to the customer's Replicate account.
   */
  isByok?: boolean;
  organizationId: string;
  outputIndex?: number;
  /**
   * Key of the file inside an object-shaped prediction output (for example
   * `model_file` on image-to-3D models). Absent for URL or URL-array outputs.
   */
  outputKey?: string;
  /**
   * Work to start once this prediction's output is stored. `models3d-build`
   * starts the 3D build from the finished view sheet.
   */
  chain?: { kind: 'models3d-build' };
}
