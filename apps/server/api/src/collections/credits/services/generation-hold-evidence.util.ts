import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import { submittedGenerationMetadataSchema } from '@api/helpers/utils/credits/persist-submission-failure.util';
import { IngredientStatus } from '@genfeedai/contracts';

/**
 * A generation the user cancelled, or that the processing-timeout cron failed,
 * is given up on: its hold goes back at the next sweep instead of waiting for
 * the provider ceiling. The provider may still finish the output; if it does,
 * the late completion is charged on its own (#5886), so this cannot give a
 * delivered output away.
 */
const ABANDONED_GENERATION_RELEASE: ReadonlyMap<string, 'release' | 'expiry'> =
  new Map([
    [GENERATION_CANCELLED_BY_USER, 'release'],
    [INGREDIENT_PROCESSING_TIMEOUT_ERROR, 'expiry'],
  ]);

/**
 * How an intent-bound hold on a given-up-on generation is released, or
 * undefined when the generation is not abandoned. Crun resolves through its
 * own task receipts, never from here.
 */
export function abandonedReleaseReason(
  ingredient:
    | { generationError: string | null; isDeleted: boolean; status: unknown }
    | undefined,
  provider: string,
): 'release' | 'expiry' | undefined {
  if (
    !ingredient ||
    ingredient.isDeleted ||
    String(ingredient.status) !== IngredientStatus.FAILED ||
    provider === 'crun'
  )
    return undefined;
  return ABANDONED_GENERATION_RELEASE.get(ingredient.generationError ?? '');
}

/** Whether the hold metadata carries the provider's confirmed failure. */
export function isFailureConfirmed(
  metadata: unknown,
  ingredientId: string,
): boolean {
  const proof = submittedGenerationMetadataSchema.safeParse(metadata);
  if (!proof.success) return false;
  const evidence = proof.data;
  return (
    evidence.assetId === ingredientId &&
    evidence.confirmedFailure?.ingredientId === ingredientId &&
    evidence.confirmedFailure.provider === evidence.submissionIntent.provider
  );
}
