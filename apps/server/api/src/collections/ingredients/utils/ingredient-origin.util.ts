import { IngredientOrigin, IngredientStatus } from '@genfeedai/contracts';

/**
 * The columns the legacy classification reads. Everything else about an asset
 * is irrelevant to where it came from.
 */
export interface LegacyOriginInput {
  bookmarkId?: string | null;
  generationPrompt?: string | null;
  generationSource?: string | null;
  modelUsed?: string | null;
  status?: string | null;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Classify a row that predates the stored `origin` column. These are the same
 * rules, in the same order, as the one-time backfill migration:
 *
 * 1. linked to an imported source (bookmark)  -> Imported
 * 2. carries a generation receipt (prompt, model or generation source) -> Generated
 * 3. `UPLOADED` status without a receipt      -> Uploaded
 * 4. anything else                            -> Unknown
 */
export function classifyLegacyIngredientOrigin(
  input: LegacyOriginInput,
): IngredientOrigin {
  if (hasText(input.bookmarkId)) {
    return IngredientOrigin.IMPORTED;
  }

  if (
    hasText(input.generationPrompt) ||
    hasText(input.modelUsed) ||
    hasText(input.generationSource)
  ) {
    return IngredientOrigin.GENERATED;
  }

  if (input.status === IngredientStatus.UPLOADED) {
    return IngredientOrigin.UPLOADED;
  }

  return IngredientOrigin.UNKNOWN;
}
