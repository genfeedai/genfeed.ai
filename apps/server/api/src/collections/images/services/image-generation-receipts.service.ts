import type {
  ImageGenerationContext,
  ImageGenerationSavedIngredient,
} from '@api/collections/images/services/image-generation.types';
import { ImageGenerationProviderRegistryService } from '@api/collections/images/services/image-generation-provider-registry.service';
import {
  resolveMediaGenerationReceiptPrompts,
  resolveMediaGenerationReceiptSurface,
} from '@api/services/media-generation-receipts/media-generation-receipt-input.util';
import { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import { Injectable } from '@nestjs/common';

/**
 * Describes a Studio image request's outputs to the generation receipts
 * (#6484). Every write is detached: a receipt can never hold or fail dispatch.
 */
@Injectable()
export class ImageGenerationReceiptsService {
  constructor(
    private readonly receipts: MediaGenerationReceiptsService,
    private readonly providerRegistry: ImageGenerationProviderRegistryService,
  ) {}

  /** Opens the receipt of one output admitted for dispatch. */
  open(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
  ): void {
    void this.receipts.open({
      organizationId: context.user.organizationId,
      brandId: String(context.brand.id),
      actorId: context.user.userId ?? context.user.id,
      isApiKey: context.user.isApiKey,
      apiKeyId: context.user.apiKeyId,
      scopes: context.user.scopes,
      ingredientId: String(ingredientId),
      parentIngredientId: String(context.ingredientData.id),
      mediaKind: 'image',
      surface: resolveMediaGenerationReceiptSurface(),
      provider: this.provider(context),
      model: context.model,
      ...resolveMediaGenerationReceiptPrompts({
        harness: context.generationHarness,
        fallbackPrompt:
          context.createImageDto.text ?? context.promptData.original ?? '',
        dispatched: [
          context.compiledDispatch?.prompt,
          context.providerInput?.prompt,
        ],
      }),
      generationParameters: {
        width: context.width,
        height: context.height,
        outputs: context.outputs,
        ...(context.style ? { style: context.style } : {}),
        ...(context.editing ? { operation: 'edit' } : {}),
      },
    });
  }

  /**
   * Records that the provider accepted one output. An inline provider has no
   * remote job, so the output id itself is the attempt reference.
   */
  accepted(
    context: ImageGenerationContext,
    ingredientId: ImageGenerationSavedIngredient['id'],
    externalId: string = String(ingredientId),
  ): void {
    void this.receipts.recordAccepted({
      organizationId: context.user.organizationId,
      ingredientId: String(ingredientId),
      provider: this.provider(context),
      model: context.model,
      externalId,
    });
  }

  private provider(context: ImageGenerationContext): string {
    return (
      this.providerRegistry.providerFor(context.model, context.modelProvider) ??
      context.modelProvider ??
      'genfeed'
    );
  }
}
