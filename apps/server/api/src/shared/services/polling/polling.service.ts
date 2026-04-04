import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PopulateOption } from '@genfeedai/interfaces';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export class PollingTimeoutError extends Error {
  constructor(
    message: string,
    public readonly ingredientId: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = 'PollingTimeoutError';
  }
}

@Injectable()
export class PollingService {
  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Wait for an ingredient to complete generation (GENERATED or FAILED status)
   * @param ingredientId - The ID of the ingredient to poll
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param pollIntervalMs - Interval between polls in milliseconds
   * @param populate - Optional populate options for the returned ingredient
   * @returns The completed ingredient with GENERATED or FAILED status
   * @throws PollingTimeoutError if timeout is reached
   */
  async waitForIngredientCompletion(
    ingredientId: string,
    timeoutMs: number,
    pollIntervalMs: number,
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument> {
    const startTime = Date.now();
    const endTime = startTime + timeoutMs;

    this.loggerService.log('Starting ingredient polling', {
      ingredientId,
      pollIntervalMs,
      timeoutMs,
    });

    while (Date.now() < endTime) {
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

      const status = ingredient.status;

      // Check if generation is complete (success or failure)
      if (
        status === IngredientStatus.GENERATED ||
        status === IngredientStatus.FAILED
      ) {
        const elapsed = Date.now() - startTime;
        this.loggerService.log('Ingredient polling completed', {
          elapsedMs: elapsed,
          ingredientId,
          status,
        });

        return ingredient;
      }

      // Still processing, wait before next poll
      const remainingTime = endTime - Date.now();
      const waitTime = Math.min(pollIntervalMs, remainingTime);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // Timeout reached
    const elapsed = Date.now() - startTime;
    this.loggerService.warn('Ingredient polling timeout', {
      elapsedMs: elapsed,
      ingredientId,
      timeoutMs,
    });

    // Return the ingredient even if it's still processing (so caller can see current state)
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

    throw new PollingTimeoutError(
      `Ingredient ${ingredientId} did not complete within ${timeoutMs}ms. Current status: ${ingredient.status}`,
      ingredientId,
      timeoutMs,
    );
  }

  /**
   * Wait for multiple ingredients to complete
   * @param ingredientIds - Array of ingredient IDs to poll
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @param pollIntervalMs - Interval between polls in milliseconds
   * @param populate - Optional populate options for returned ingredients
   * @returns Array of completed ingredients (may include FAILED status)
   * @throws PollingTimeoutError if timeout is reached before all complete
   */
  async waitForMultipleIngredientsCompletion(
    ingredientIds: string[],
    timeoutMs: number,
    pollIntervalMs: number,
    populate: PopulateOption[] = [],
  ): Promise<IngredientDocument[]> {
    const startTime = Date.now();
    const endTime = startTime + timeoutMs;

    this.loggerService.log('Starting multiple ingredient polling', {
      count: ingredientIds.length,
      ingredientIds,
      pollIntervalMs,
      timeoutMs,
    });

    const completedIds = new Set<string>();
    const results: IngredientDocument[] = [];

    while (Date.now() < endTime && completedIds.size < ingredientIds.length) {
      // Poll all incomplete ingredients in parallel
      const incompleteIds = ingredientIds.filter((id) => !completedIds.has(id));

      const pollingPromises = incompleteIds.map(async (id) => {
        const ingredient = await this.ingredientsService.findOne(
          { _id: id },
          populate,
        );

        if (!ingredient) {
          throw new HttpException(
            {
              detail: `Ingredient with id ${id} not found`,
              title: 'Ingredient not found',
            },
            HttpStatus.NOT_FOUND,
          );
        }

        const status = ingredient.status;

        if (
          status === IngredientStatus.GENERATED ||
          status === IngredientStatus.FAILED
        ) {
          if (!completedIds.has(id)) {
            completedIds.add(id);
            results.push(ingredient);
          }
        }

        return { id, ingredient, isComplete: completedIds.has(id) };
      });

      await Promise.all(pollingPromises);

      // If all are complete, return results
      if (completedIds.size === ingredientIds.length) {
        const elapsed = Date.now() - startTime;
        this.loggerService.log('All ingredients polling completed', {
          count: results.length,
          elapsedMs: elapsed,
          ingredientIds,
        });

        // Sort results to match input order
        return ingredientIds
          .map((id) => results.find((r) => r._id.toString() === id))
          .filter((r): r is IngredientDocument => r !== undefined);
      }

      // Wait before next poll
      const remainingTime = endTime - Date.now();
      const waitTime = Math.min(pollIntervalMs, remainingTime);

      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // Timeout reached - check which ones are still incomplete
    const incompleteIds = ingredientIds.filter((id) => !completedIds.has(id));
    const _incompleteIngredients = await Promise.all(
      incompleteIds.map((id) =>
        this.ingredientsService.findOne({ _id: id }, populate),
      ),
    );

    const elapsed = Date.now() - startTime;
    this.loggerService.warn('Multiple ingredient polling timeout', {
      completed: completedIds.size,
      elapsedMs: elapsed,
      incomplete: incompleteIds.length,
      incompleteIds,
      timeoutMs,
    });

    // If some completed, throw timeout error with details
    if (results.length > 0) {
      throw new PollingTimeoutError(
        `Only ${results.length} of ${ingredientIds.length} ingredients completed within ${timeoutMs}ms. Incomplete: ${incompleteIds.join(', ')}`,
        incompleteIds[0] || ingredientIds[0],
        timeoutMs,
      );
    }

    // None completed
    throw new PollingTimeoutError(
      `No ingredients completed within ${timeoutMs}ms`,
      ingredientIds[0],
      timeoutMs,
    );
  }

  /**
   * Sleep utility for polling intervals
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
