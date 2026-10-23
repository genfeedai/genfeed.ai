import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  assertRequiredSchemaInput,
  replicateModelIdToSlug,
} from '@api/services/prompt-builder/utils/replicate-schema.util';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

@Injectable()
export class ReplicateVideoGenerationProviderAdapter
  implements VideoGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(
    private readonly replicateService: ReplicateService,
    private readonly polling: PollUntilService,
  ) {}

  supports(_model: string, provider?: ModelProvider | string): boolean {
    return !provider || provider === ModelProvider.REPLICATE;
  }

  async generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    this.assertHailuoFirstFrame(params);
    const externalId = params.isRoutedOffer
      ? await this.replicateService.generateTextToVideo(
          params.modelEndpoint ?? params.model,
          params.promptParams,
          params.apiKeyOverride,
          params.onProviderSubmissionStarted,
          false,
        )
      : await this.replicateService.generateTextToVideo(
          params.modelEndpoint ?? params.model,
          params.promptParams,
          params.apiKeyOverride,
          params.onProviderSubmissionStarted,
        );
    if (params.isRoutedOffer) {
      try {
        const result = await this.polling.poll(
          async () => {
            const prediction = z
              .object({ status: z.string(), output: z.unknown().optional() })
              .parse(
                await this.replicateService.getPrediction(
                  externalId,
                  params.apiKeyOverride,
                ),
              );
            if (['failed', 'canceled'].includes(prediction.status))
              throw new Error('Replicate generation failed before output');
            return prediction;
          },
          (prediction) => prediction.status === 'succeeded',
          { timeoutMs: 600000, intervalMs: 3000, signal: params.abortSignal },
        );
        const output = Array.isArray(result.value.output)
          ? result.value.output[0]
          : result.value.output;
        if (!isAllowedReplicateOutputUrl(output))
          throw new Error('Replicate returned no allowed video output');
        return {
          completion: 'remote-output',
          externalId: output,
          provider: this.provider,
        };
      } catch (error: unknown) {
        try {
          await this.replicateService.cancelPrediction(
            externalId,
            params.apiKeyOverride,
          );
        } catch {
          /* A completed or terminal prediction cannot always be cancelled. */
        }
        throw error;
      }
    }
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
