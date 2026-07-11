import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { IngredientStatus } from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PollUntilService } from '@server/shared/services/poll-until/poll-until.service';

/** Statuses that end an ingredient's generation, success or failure. */
const TERMINAL_STATUSES: string[] = [
  IngredientStatus.GENERATED,
  IngredientStatus.FAILED,
];

function isTerminalStatus(status: unknown): boolean {
  return TERMINAL_STATUSES.includes(String(status));
}

/**
 * Ingredient-completion adapter over {@link PollUntilService}.
 *
 * Replaces the retired `PollingService`, which re-implemented its own polling
 * loop. This delegates all loop mechanics (interval, deadline, timeout) to the
 * single {@link PollUntilService} engine and only owns the ingredient-specific
 * concerns: reading the ingredient and deciding when its status is terminal.
 *
 * On timeout {@link PollUntilService} throws `PollTimeoutException`; callers
 * that want to surface the ingredient's current state re-read it in their own
 * catch block (see the image/video/music operation handlers).
 */
@Injectable()
export class IngredientCompletionService {
  constructor(
    private readonly pollUntilService: PollUntilService,
    private readonly ingredientsService: IngredientsService,
  ) {}

  /**
   * Wait for a single ingredient to reach a terminal status (GENERATED or
   * FAILED).
   *
   * @throws NotFound HttpException if the ingredient disappears mid-poll.
   * @throws PollTimeoutException if the timeout is reached first.
   */
  async waitForIngredientCompletion(
    ingredientId: string,
    timeoutMs: number,
    pollIntervalMs: number,
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument> {
    const { value } = await this.pollUntilService.poll(
      () => this.readIngredientOrThrow(ingredientId, populate),
      (ingredient) => isTerminalStatus(ingredient.status),
      { intervalMs: pollIntervalMs, timeoutMs },
    );
    return value;
  }

  /**
   * Wait for every ingredient in `ingredientIds` to reach a terminal status.
   * Returns the completed ingredients in input order.
   *
   * @throws NotFound HttpException if any ingredient disappears mid-poll.
   * @throws PollTimeoutException if the timeout is reached before all complete.
   */
  async waitForMultipleIngredientsCompletion(
    ingredientIds: string[],
    timeoutMs: number,
    pollIntervalMs: number,
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument[]> {
    const uniqueIds = [...new Set(ingredientIds)];
    const completed = new Map<string, IngredientDocument>();

    const { value } = await this.pollUntilService.poll(
      async () => {
        const incompleteIds = uniqueIds.filter((id) => !completed.has(id));
        const ingredients = await Promise.all(
          incompleteIds.map((id) => this.readIngredientOrThrow(id, populate)),
        );

        for (let index = 0; index < incompleteIds.length; index++) {
          const ingredient = ingredients[index];
          if (ingredient && isTerminalStatus(ingredient.status)) {
            completed.set(incompleteIds[index], ingredient);
          }
        }

        return completed;
      },
      (terminalIngredients) => terminalIngredients.size === uniqueIds.length,
      { intervalMs: pollIntervalMs, timeoutMs },
    );

    return ingredientIds
      .map((id) => value.get(id))
      .filter(
        (ingredient): ingredient is IngredientDocument =>
          ingredient !== undefined,
      );
  }

  private async readIngredientOrThrow(
    ingredientId: string,
    populate: PopulateOption[],
  ): Promise<IngredientDocument> {
    const ingredient = await this.ingredientsService.findOne(
      { _id: ingredientId },
      populate,
    );

    if (!ingredient) {
      throw new HttpException(
        {
          detail: `Ingredient with id ${ingredientId} not found`,
          title: 'Ingredient not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return ingredient;
  }
}
