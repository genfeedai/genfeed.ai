import { REVIEWED_RATE_SHEET_ENTRIES } from './reviewed-rate-sheet.data';
import type { ReviewedRateSheetEntry } from './reviewed-rate-sheet.types';

export * from './replicate-billing-tiers';
export { REVIEWED_RATE_SHEET_ENTRIES } from './reviewed-rate-sheet.data';
export type { ReviewedRateSheetEntry } from './reviewed-rate-sheet.types';
export { UNPRICED_MODELS } from './unpriced-models';

/** The sheet entry for one registry row, or undefined when it has none. */
export function findReviewedRateSheetEntry(
  provider: string,
  endpoint: string,
): ReviewedRateSheetEntry | undefined {
  return REVIEWED_RATE_SHEET_ENTRIES.find(
    (entry) => entry.provider === provider && entry.endpoint === endpoint,
  );
}

export * from './replicate-variant-selectors';
export * from './reviewed-rate-sheet-hash';
export * from './variant-rule-validation';
export * from './variant-selectors';
