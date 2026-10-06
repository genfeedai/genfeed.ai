import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IngredientRecovery } from '@genfeedai/contracts/interfaces/ingredients/ingredient-recovery.interface';

/** Legacy provider errors are free text. Only explicit evidence earns a retry. */
export function getIngredientRecovery(
  ingredient: IIngredient,
): IngredientRecovery {
  const reason =
    ingredient.status === IngredientStatus.FAILED
      ? (ingredient.generationError?.toLowerCase() ?? '')
      : '';
  if (
    /reference.*(missing|not found|unavailable|expired)|(?:missing|expired).*reference/.test(
      reason,
    )
  ) {
    return {
      action: 'replaceReference',
      group: 'attention',
      reason: 'missingReference',
    };
  }
  if (
    /content policy|safety|nsfw|moderation|content.*(?:blocked|rejected)/.test(
      reason,
    )
  ) {
    return {
      action: 'editPrompt',
      group: 'attention',
      reason: 'requestRejected',
    };
  }
  if (
    /\b422\b|invalid (?:input|parameter|argument)|validation|unsupported|aspect ratio/.test(
      reason,
    )
  ) {
    return {
      action: 'reviewInputs',
      group: 'attention',
      reason: 'invalidInputs',
    };
  }
  if (
    /service unavailable|serviceunavailable|\b50[234]\b|gateway timeout|timed? ?out|rate limit|\b429\b/.test(
      reason,
    )
  ) {
    if (
      ingredient.category !== IngredientCategory.IMAGE &&
      ingredient.category !== IngredientCategory.VIDEO
    ) {
      return {
        action: 'viewDetails',
        group: 'attention',
        reason: 'unsupportedRecovery',
      };
    }
    if (
      !ingredient.promptText?.trim() &&
      !ingredient.generationPrompt?.trim() &&
      !ingredient.text?.trim()
    ) {
      return {
        action: 'viewDetails',
        group: 'attention',
        reason: 'missingPrompt',
      };
    }
    return { action: 'retry', group: 'retry', reason: 'serviceUnavailable' };
  }
  return { action: 'viewDetails', group: 'unknown', reason: 'unknown' };
}
