import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { GenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import {
  isFalDestination,
  isGenfeedAiDestination,
  isReplicateDestination,
} from '@api/collections/models/utils/model-key.util';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  canReceiveProviderWebhooks,
  isCloudDeployment,
} from '@genfeedai/config';
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

const LOCAL_PREDICTION_POLL_INTERVAL_MS = 2_000;
const LOCAL_PREDICTION_TIMEOUT_MS = 180_000;

type ReplicatePrediction = {
  error?: string;
  output?: unknown;
  status?: string;
};

const extractOutputUrls = (output: unknown): string[] => {
  if (typeof output === 'string') {
    return [output];
  }

  if (!Array.isArray(output)) {
    return [];
  }

  return output.filter((value): value is string => typeof value === 'string');
};

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

  private async waitForLocalPrediction(
    predictionId: string,
    signal?: AbortSignal,
  ): Promise<string[]> {
    const deadline = Date.now() + LOCAL_PREDICTION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        await this.replicateService.cancelPrediction(predictionId);
        throw new GenerationCancelledError();
      }

      const prediction = (await this.replicateService.getPrediction(
        predictionId,
      )) as ReplicatePrediction;

      if (signal?.aborted) {
        await this.replicateService.cancelPrediction(predictionId);
        throw new GenerationCancelledError();
      }

      if (prediction.status === 'succeeded') {
        const outputUrls = extractOutputUrls(prediction.output);
        if (outputUrls.length === 0) {
          throw new Error(
            `Replicate prediction ${predictionId} succeeded without an output URL`,
          );
        }
        return outputUrls;
      }

      if (prediction.status === 'canceled') {
        throw new GenerationCancelledError();
      }

      if (prediction.status === 'failed') {
        throw new Error(
          prediction.error ||
            `Replicate prediction ${predictionId} ${prediction.status}`,
        );
      }

      await this.sleep(LOCAL_PREDICTION_POLL_INTERVAL_MS, signal);
    }

    throw new Error(
      `Replicate prediction ${predictionId} timed out after ${LOCAL_PREDICTION_TIMEOUT_MS}ms`,
    );
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new GenerationCancelledError());
        return;
      }

      const onAbort = () => {
        clearTimeout(timer);
        reject(new GenerationCancelledError());
      };

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    });
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
        await request.onExternalJobCreated?.(generationId);
        // Cloud + public webhook URL: leave completion to the Replicate
        // webhook (finishGeneration polls the DB). Local SaaS
        // (GENFEED_CLOUD=true with api.genfeed.localhost) and self-hosted
        // never receive provider webhooks, so poll Replicate and return
        // output URLs for immediate finalize/upload.
        const shouldPollForOutput =
          !isCloudDeployment() || !canReceiveProviderWebhooks();
        const outputUrls = shouldPollForOutput
          ? await this.waitForLocalPrediction(generationId, request.abortSignal)
          : undefined;

        return {
          externalId: generationId,
          kind: 'external-id',
          ...(outputUrls ? { outputUrls } : {}),
        };
      },
      outputStrategy: isBatchSupported ? 'batch' : 'sequential',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
