import { INGREDIENT_PROCESSING_TIMEOUT_ERROR } from '@api/collections/ingredients/constants/processing-timeout.constants';
import type { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  INGREDIENT_STATE_MACHINE,
  IngredientStatus,
} from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';
import { ConflictException } from '@nestjs/common';

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

export interface IngredientGenerationSettlement {
  id: string;
  organizationId?: string | null;
  /** GENERATED, UPLOADED or FAILED. */
  to: IngredientStatus;
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

/**
 * Settles a generation that is still PROCESSING (#9735). A generation the
 * stuck-ingredient cron timed out is reopened first, so a late result still
 * lands; one the user cancelled or the provider failed stays as it is.
 *
 * @returns whether this call settled the generation.
 */
export const settleIngredientGeneration = traced(
  'settleIngredientGeneration',
  async (
    ingredients: Pick<IngredientsService, 'patchAll'>,
    settlement: IngredientGenerationSettlement,
  ): Promise<boolean> => {
    const claim = () =>
      transitionIngredientStatus(ingredients, {
        data: settlement.data,
        from: IngredientStatus.PROCESSING,
        id: settlement.id,
        organizationId: settlement.organizationId,
        to: settlement.to,
      });
    if (await claim()) return true;
    const reopened = await transitionIngredientStatus(ingredients, {
      data: { generationError: null },
      from: IngredientStatus.FAILED,
      id: settlement.id,
      match: { generationError: INGREDIENT_PROCESSING_TIMEOUT_ERROR },
      organizationId: settlement.organizationId,
      to: IngredientStatus.PROCESSING,
    });
    return reopened && (await claim());
  },
);

/**
 * Settles a generation that two writers report, such as the files worker's
 * completion event and the request that queued the job (#9735). Whichever
 * report lands second finds the row already in `to`; it still counts and
 * writes its `data`. A generation the user stopped, or one the other writer
 * settled the other way, is left as it is.
 *
 * @returns whether the generation is now settled as `to`.
 */
export const settleSharedIngredientGeneration = traced(
  'settleSharedIngredientGeneration',
  async (
    ingredients: Pick<IngredientsService, 'patchAll'>,
    settlement: IngredientGenerationSettlement,
  ): Promise<boolean> => {
    if (await settleIngredientGeneration(ingredients, settlement)) return true;
    const { modifiedCount } = await ingredients.patchAll(
      {
        id: settlement.id,
        ...(settlement.organizationId
          ? { organizationId: settlement.organizationId }
          : {}),
        isDeleted: false,
        status: settlement.to,
      },
      { ...settlement.data, status: settlement.to },
    );
    return modifiedCount === 1;
  },
);

/**
 * Applies a PATCH body to an ingredient. A `status` that differs from the
 * stored one is an edge of `INGREDIENT_STATE_MACHINE`, written as a
 * compare-and-set so a review on a stale tab cannot settle a generation that is
 * still PROCESSING (#10404). An edge the table does not allow, or a status that
 * changed since the read, throws a 409. Every other field is a plain write.
 */
export async function patchIngredientWithStatusEdge(
  ingredients: Pick<IngredientsService, 'patch' | 'patchAll'>,
  ingredient: { id: string; status: string },
  body: Record<string, unknown>,
  organizationId: string,
): Promise<void> {
  const { status: requested, ...fields } = body;
  if (requested !== undefined && requested !== ingredient.status) {
    const from = ingredient.status as IngredientStatus;
    const to = requested as IngredientStatus;
    if (!INGREDIENT_STATE_MACHINE.can(from, to)) {
      throw new ConflictException(
        `Ingredient cannot move from ${from} to ${to}`,
      );
    }
    const moved = await transitionIngredientStatus(ingredients, {
      from,
      id: ingredient.id,
      organizationId,
      to,
    });
    if (!moved) {
      throw new ConflictException(
        `Ingredient status changed while it was being updated; it is no longer ${from}`,
      );
    }
  }
  if (Object.keys(fields).length > 0) {
    await ingredients.patch(
      ingredient.id,
      fields as unknown as UpdateIngredientDto,
    );
  }
}
