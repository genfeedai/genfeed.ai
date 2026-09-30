import { GENERATION_CANCELLED_BY_USER } from '@api/collections/ingredients/constants/generation-cancellation.constants';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { generationQuoteGroupReceiptSchema } from '@api/helpers/utils/credits/generation-quote-group.schema';
import { persistQuoteGroupFailure } from '@api/helpers/utils/credits/persist-quote-group-failure.util';
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

    const isQuoteGroup = generationQuoteGroupReceiptSchema.safeParse(
      ingredient.generationBilling,
    ).success;
    const confirmedCancellation = await this.cancelProviderJob(
      ingredient,
      isQuoteGroup,
    );
    if (isQuoteGroup) {
      if (!confirmedCancellation) return ingredient;
      const claimed = await this.ingredientsService.patchAll(
        {
          id: ingredient.id,
          organizationId: input.organizationId,
          isDeleted: false,
          status: IngredientStatus.PROCESSING,
        },
        {
          generationError: GENERATION_CANCELLED_BY_USER,
          status: IngredientStatus.FAILED,
          isGenerationFailureConfirmed: true,
        },
      );
      if (claimed.modifiedCount === 1) {
        await persistQuoteGroupFailure(
          this.ingredientsService.prisma,
          ingredient.id,
          input.organizationId,
        );
        await this.failedGenerationService.notifyFailedGeneration({
          ingredientId: ingredient.id,
          organizationId: input.organizationId,
          userId: input.userId,
          websocketMessage: GENERATION_CANCELLED_BY_USER,
          websocketMethod: 'publishMediaFailed',
          websocketUrl: this.websocketPathFor(ingredient),
        });
      }
      return (
        (await this.ingredientsService.findOne(
          scopedWhere(input.organizationId, { id: input.id }),
          [PopulatePatterns.metadataFull],
        )) ?? ingredient
      );
    }

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
    requireConfirmation: boolean,
  ): Promise<boolean> {
    const metadata = ingredient.metadata;
    const externalId =
      typeof metadata?.externalId === 'string' ? metadata.externalId : null;
    const externalProvider =
      typeof metadata?.externalProvider === 'string'
        ? metadata.externalProvider
        : null;

    if (!externalId) {
      return false;
    }

    const isReplicateJob =
      externalProvider === 'replicate' ||
      (!externalProvider && !externalId.includes('://'));

    if (!isReplicateJob) {
      return false;
    }

    try {
      const predictionId = this.replicatePredictionId(externalId);
      await this.replicateService.cancelPrediction(predictionId);
      if (!requireConfirmation) return true;
      const prediction =
        await this.replicateService.getPrediction(predictionId);
      return Boolean(
        prediction &&
          typeof prediction === 'object' &&
          'status' in prediction &&
          (prediction.status === 'canceled' || prediction.status === 'failed'),
      );
    } catch (error: unknown) {
      this.loggerService.warn(
        'Provider cancellation is unconfirmed; retain funded generation for completion',
        {
          error: (error as Error)?.message,
          externalId,
          ingredientId: ingredient.id,
        },
      );
      return false;
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
