import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import {
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

const REPLICATE_IMAGE_MODELS: readonly string[] = [
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_3,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_FAST,
  MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4_ULTRA,
];

@Injectable()
export class ReplicateImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
  ) {}

  supports(model: string): boolean {
    return (
      !isFalDestination(model) &&
      !isGenfeedAiDestination(model) &&
      (REPLICATE_IMAGE_MODELS.includes(model) || isReplicateDestination(model))
    );
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    const isBatchSupported =
      MODEL_OUTPUT_CAPABILITIES[request.model]?.isBatchSupported ?? false;
    const { input } = await this.promptBuilderService.buildPrompt(
      request.model,
      {
        blacklist: request.createImageDto.blacklist,
        brand: request.promptBuilderBrand,
        branding: request.brandPromptBranding,
        brandingMode: request.createImageDto.brandingMode,
        camera: request.createImageDto.camera,
        fontFamily: request.createImageDto.fontFamily,
        height: request.height,
        isBrandingEnabled: request.createImageDto.isBrandingEnabled,
        lens: request.createImageDto.lens,
        lighting: request.createImageDto.lighting,
        modelCategory: ModelCategory.IMAGE,
        mood: request.createImageDto.mood,
        outputs: isBatchSupported ? request.outputs : 1,
        prompt: request.prompt,
        promptTemplate: request.createImageDto.promptTemplate,
        references: request.referenceImageUrls,
        scene: request.createImageDto.scene,
        seed: request.createImageDto.seed,
        style: request.style || request.createImageDto.style || 'realistic',
        tags: request.createImageDto.tags?.map((tag) => tag.toString()) || [],
        useTemplate: request.createImageDto.useTemplate,
        width: request.width,
      },
      request.organizationId,
    );

    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel:
        'ReplicateService generateImage (additional output)',
      additionalPlaceholderFailureLabel: 'Replicate',
      completionKind: 'poll-multiple',
      failureLabel: 'ReplicateService generateImage',
      generate: async () => {
        const generationId = await this.replicateService.generateTextToImage(
          request.model,
          input,
        );
        if (!generationId) {
          throw new Error('No generation ID returned from Replicate');
        }
        return { externalId: generationId, kind: 'external-id' };
      },
      outputStrategy: isBatchSupported ? 'batch' : 'sequential',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
