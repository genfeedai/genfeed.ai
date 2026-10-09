import type { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import type { ImageGenerationSavedIngredient } from '@api/collections/images/services/image-generation.types';
import type { MediaGenerationCostService } from '@api/services/media-vendor-cost/media-generation-cost.service';
import type { GenerationEventWebhookService } from '@api/services/webhook-client/generation-event-webhook.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { GenerationWebhookOutput } from '@genfeedai/contracts/api-types/contracts/generation-webhook-events.contract';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

const IMAGE_POPULATE = [
  PopulatePatterns.promptFull,
  PopulatePatterns.metadataFull,
  PopulatePatterns.brandMinimal,
];

import type {
  ImageGenerationCompletionPlan,
  ImageGenerationContext,
} from '@api/collections/images/services/image-generation.types';
import type { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
export async function resolveImageGenerationCompletion(
  imagesService: ImagesService,
  ingredientCompletionService: IngredientCompletionService,
  context: ImageGenerationContext,
  plan: ImageGenerationCompletionPlan,
): Promise<unknown> {
  if (plan.kind === 'inline') {
    return imagesService.findOne(
      { id: context.ingredientData.id },
      IMAGE_POPULATE,
    );
  }

  if (plan.kind === 'poll-multiple') {
    const completedIngredients =
      await ingredientCompletionService.waitForMultipleIngredientsCompletion(
        plan.pollIds ?? [context.ingredientData.id.toString()],
        180_000, // 3 minutes timeout
        2_000, // 2 seconds poll interval
        IMAGE_POPULATE,
        context.abortSignal,
      );
    return completedIngredients[0];
  }

  // poll-single
  return ingredientCompletionService.waitForIngredientCompletion(
    context.ingredientData.id.toString(),
    180000, // 3 minutes timeout
    2000, // 2 seconds poll interval
    IMAGE_POPULATE,
    context.abortSignal,
  );
}

export interface RealizedImageDimensions {
  height?: number;
  width?: number;
}

interface ImageGenerationCompletionDependencies {
  generationBilling: GenerationBillingService;
  loggerService: LoggerService;
  mediaGenerationCostService: MediaGenerationCostService;
  generationEventWebhookService: GenerationEventWebhookService;
}

export async function completeImageGeneration(
  dependencies: ImageGenerationCompletionDependencies,
  context: ImageGenerationContext,
  ingredientId: ImageGenerationSavedIngredient['id'],
  output: GenerationWebhookOutput,
  dimensions: RealizedImageDimensions,
): Promise<void> {
  try {
    await dependencies.generationBilling.settleOutput(
      ingredientId.toString(),
      context.user.organizationId,
    );
  } catch (error: unknown) {
    dependencies.loggerService.error('Image credit settlement failed', error, {
      ingredientId: ingredientId.toString(),
    });
  }
  await dependencies.mediaGenerationCostService.recordGenerationCost({
    brandId: context.brand.id?.toString() ?? null,
    category: 'image',
    height: dimensions.height ?? null,
    ingredientId: ingredientId.toString(),
    modelKey: context.model,
    organizationId: context.user.organizationId,
    width: dimensions.width ?? null,
  });

  await dependencies.generationEventWebhookService.emitGenerationCompleted({
    brandId: context.brand.id?.toString() ?? null,
    generationId: ingredientId.toString(),
    kind: 'image',
    model: context.model,
    organizationId: context.user.organizationId,
    output,
  });
}

/**
 * Translate a polling timeout into a 504 with the ingredient's current
 * status. No-op (caller re-throws the original error) for any other error or
 * when the ingredient can no longer be read.
 */
export async function throwImageGatewayTimeoutIfPending(
  imagesService: ImagesService,
  error: unknown,
  context: ImageGenerationContext,
): Promise<void> {
  if (!(error instanceof PollTimeoutException)) {
    return;
  }

  const ingredient = await imagesService.findOne(
    { id: context.ingredientData.id },
    IMAGE_POPULATE,
  );

  if (ingredient) {
    throw new HttpException(
      {
        detail: `Image generation did not complete within 3 minutes. Current status: ${ingredient.status}`,
        title: 'Generation timeout',
      },
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}
