import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  INGREDIENT_STATE_MACHINE,
  type IngredientStatus,
} from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';

export interface IngredientStatusTransition {
  id: string;
  /** Left out only for a self-hosted row that has no organization. */
  organizationId?: string | null;
  /** The status the row must still hold; the write matches nothing otherwise. */
  from: IngredientStatus;
  to: IngredientStatus;
  /** Other columns that must still match, such as the timeout marker. */
  match?: Record<string, unknown>;
  /** Columns written together with the new status. */
  data?: Record<string, unknown>;
}

/**
 * Moves one ingredient along `INGREDIENT_STATE_MACHINE` (#9735). The write is
 * a compare-and-set on `from`, so a late provider webhook cannot overwrite an
 * outcome that settled after the caller read the row. An edge the table does
 * not allow is a programming error and throws before any write.
 *
 * @returns whether this call made the transition.
 */
export const transitionIngredientStatus = traced(
  'transitionIngredientStatus',
  async (
    ingredients: Pick<IngredientsService, 'patchAll'>,
    transition: IngredientStatusTransition,
  ): Promise<boolean> => {
    if (!INGREDIENT_STATE_MACHINE.can(transition.from, transition.to)) {
      throw new Error(
        `Ingredient ${transition.id} cannot move from ${transition.from} to ${transition.to}`,
      );
    }
    const { modifiedCount } = await ingredients.patchAll(
      {
        ...transition.match,
        id: transition.id,
        ...(transition.organizationId
          ? { organizationId: transition.organizationId }
          : {}),
        isDeleted: false,
        status: transition.from,
      },
      { ...transition.data, status: transition.to },
    );
    return modifiedCount === 1;
  },
);
