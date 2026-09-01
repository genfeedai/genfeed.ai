import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelProvider } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import {
  assertRequiredSchemaInput,
  replicateModelIdToSlug,
} from '@server/services/prompt-builder/utils/replicate-schema.util';

@Injectable()
export class ReplicateVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(private readonly replicateService: ReplicateService) {}

  supports(_model: string, provider?: ModelProvider | string): boolean {
    return !provider || provider === ModelProvider.REPLICATE;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    this.assertHailuoFirstFrame(params);
    const externalId = await this.replicateService.generateTextToVideo(
      params.modelEndpoint ?? params.model,
      params.promptParams,
    );
    return {
      completion: 'polling',
      externalId,
      provider: this.provider,
    };
  }

  private assertHailuoFirstFrame(params: DispatchVideoGenerationParams): void {
    if (
      !this.isHailuo23Fast(params.model) &&
      !this.isHailuo23Fast(params.modelEndpoint ?? '')
    ) {
      return;
    }
    assertRequiredSchemaInput(
      MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
      params.promptParams,
      params.modelInputSchema,
    );
  }

  private isHailuo23Fast(modelId: string): boolean {
    return replicateModelIdToSlug(modelId) === 'hailuo-2.3-fast';
  }
}
