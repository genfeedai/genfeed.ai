import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { scopedWhere } from '@api/index';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface CancelProcessingIngredientInput {
  id: string;
  organizationId: string;
  userId?: string;
}

/**
 * Stops an in-flight studio generation: best-effort provider cancel, then
 * mark the placeholder FAILED so waitForCompletion unblocks and webhooks
 * no-op on a later completion.
 */
@Injectable()
export class IngredientGenerationCancellationService {
  constructor(
    private readonly failedGenerationService: FailedGenerationService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
  ) {}

  bindCancelOnAbort(
    input: CancelProcessingIngredientInput & {
      abortSignal: AbortSignal;
    },
  ): void {
    const cancel = () => {
      void this.cancelProcessingIngredient(input);
    };

    if (input.abortSignal.aborted) {
      cancel();
      return;
    }

    input.abortSignal.addEventListener('abort', cancel, { once: true });
  }

  async cancelProcessingIngredient(
    input: CancelProcessingIngredientInput,
  ): Promise<IngredientDocument> {
    const ingredient = await this.ingredientsService.findOne(
      scopedWhere(input.organizationId, { id: input.id }),
      [PopulatePatterns.metadataFull],
    );

    if (!ingredient) {
      throw new NotFoundException('Ingredient', input.id);
    }

    if (ingredient.status !== IngredientStatus.PROCESSING) {
      return ingredient;
    }

    await this.cancelProviderJob(ingredient);

    await this.failedGenerationService.handleFailedGeneration(
      this.ingredientsService,
      {
        ingredientId: ingredient.id.toString(),
        organizationId: input.organizationId,
        userId: input.userId,
        websocketMessage: GENERATION_CANCELLED_BY_USER,
        websocketMethod: 'publishMediaFailed',
        websocketUrl: this.websocketPathFor(ingredient),
      },
    );

    const cancelled = await this.ingredientsService.findOne(
      scopedWhere(input.organizationId, { id: input.id }),
      [PopulatePatterns.metadataFull],
    );

    return cancelled ?? { ...ingredient, status: IngredientStatus.FAILED };
  }

  private async cancelProviderJob(
    ingredient: IngredientDocument,
  ): Promise<void> {
    const metadata = ingredient.metadata;
    const externalId =
      typeof metadata?.externalId === 'string' ? metadata.externalId : null;
    const externalProvider =
      typeof metadata?.externalProvider === 'string'
        ? metadata.externalProvider
        : null;

    if (!externalId) {
      return;
    }

    const isReplicateJob =
      externalProvider === 'replicate' ||
      (!externalProvider && !externalId.includes('://'));

    if (!isReplicateJob) {
      return;
    }

    try {
      await this.replicateService.cancelPrediction(
        this.replicatePredictionId(externalId),
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        'Failed to cancel Replicate prediction; marking ingredient cancelled anyway',
        {
          error: (error as Error)?.message,
          externalId,
          ingredientId: ingredient.id,
        },
      );
    }
  }

  /**
   * Batch Replicate jobs store `${predictionId}_${index}` on each placeholder.
   * The cancel API takes the raw prediction id.
   */
  private replicatePredictionId(externalId: string): string {
    return externalId.replace(/_\d+$/, '');
  }

  private websocketPathFor(ingredient: IngredientDocument): string {
    const id = ingredient.id.toString();
    switch (ingredient.category) {
      case IngredientCategory.VIDEO:
        return WebSocketPaths.video(id);
      case IngredientCategory.MUSIC:
        return WebSocketPaths.music(id);
      default:
        return WebSocketPaths.image(id);
    }
  }
}
