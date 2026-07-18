import { isFalDestination } from '@api/collections/models/utils/model-key.util';
import { MODEL_KEYS } from '@genfeedai/constants';
import { Injectable } from '@nestjs/common';
import { FalService } from '@server/services/integrations/fal/services/fal.service';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';
import type { DispatchVideoGenerationParams } from './video-generation.types';

/**
 * Owns provider selection and request normalization for standard video
 * generation. Shared generation orchestration remains provider-agnostic.
 */
@Injectable()
export class VideoGenerationProviderDispatchService {
  constructor(
    private readonly falService: FalService,
    private readonly klingAIService: KlingAIService,
    private readonly replicateService: ReplicateService,
  ) {}

  async dispatch(
    params: DispatchVideoGenerationParams,
  ): Promise<string | null> {
    const { duration, height, imageUrl, model, prompt, promptParams, width } =
      params;

    if (model === MODEL_KEYS.KLINGAI_V2) {
      return this.klingAIService.queueGenerateTextToVideo(prompt, {
        height,
        model,
        width,
      });
    }

    if (isFalDestination(model)) {
      const result = await this.falService.generateVideo(model, {
        prompt,
        ...(duration && { duration }),
        ...(imageUrl && { image_url: imageUrl }),
      });
      return result.url;
    }

    return this.replicateService.generateTextToVideo(model, promptParams);
  }
}
