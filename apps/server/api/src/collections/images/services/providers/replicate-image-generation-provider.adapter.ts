import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import {
  interpretReplicatePredictionStatus,
  replicateImageOutputStrategy,
  replicatePredictionFailureMessage,
  replicatePredictionTimeoutMessage,
  requireReplicateOutputUrls,
  shouldPollReplicatePrediction,
} from '@api/collections/images/services/providers/replicate-image-generation.helpers';
import { GenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import { ProviderGenerationFailedError } from '@api/collections/ingredients/errors/provider-generation-failed.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  canReceiveProviderWebhooks,
  isCloudDeployment,
} from '@genfeedai/config';
import {
  isImageEditModel,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';

const LOCAL_PREDICTION_POLL_INTERVAL_MS = 2_000;
const LOCAL_PREDICTION_TIMEOUT_MS = 180_000;

type ReplicatePrediction = {
  error?: string;
  output?: unknown;
  status?: string;
};

@Injectable()
export class ReplicateImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(private readonly replicateService: ReplicateService) {}

  private async waitForLocalPrediction(
    predictionId: string,
    signal?: AbortSignal,
    apiKeyOverride?: string,
    onProviderOutput?: (output: unknown) => Promise<void>,
  ): Promise<string[]> {
    const deadline = Date.now() + LOCAL_PREDICTION_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.cancelIfPredictionAborted(
        predictionId,
        signal,
        apiKeyOverride,
      );
      const prediction = (await this.replicateService.getPrediction(
        predictionId,
        apiKeyOverride,
      )) as ReplicatePrediction;
      await this.cancelIfPredictionAborted(
        predictionId,
        signal,
        apiKeyOverride,
      );
      if (prediction.status === 'succeeded') {
        await onProviderOutput?.(prediction.output);
      }
      const outputUrls = this.resolveLocalPredictionResult(
        prediction,
        predictionId,
      );
      if (outputUrls) {
        return outputUrls;
      }
      await this.sleep(LOCAL_PREDICTION_POLL_INTERVAL_MS, signal);
    }

    throw new Error(
      replicatePredictionTimeoutMessage(
        predictionId,
        LOCAL_PREDICTION_TIMEOUT_MS,
      ),
    );
  }

  private async cancelIfPredictionAborted(
    predictionId: string,
    signal?: AbortSignal,
    apiKeyOverride?: string,
  ): Promise<void> {
    if (!signal?.aborted) {
      return;
    }
    await this.replicateService.cancelPrediction(predictionId, apiKeyOverride);
    throw new GenerationCancelledError();
  }

  private resolveLocalPredictionResult(
    prediction: ReplicatePrediction,
    predictionId: string,
  ): string[] | null {
    const status = interpretReplicatePredictionStatus(prediction.status);
    if (status === 'succeeded') {
      return requireReplicateOutputUrls(prediction.output, predictionId);
    }
    if (status === 'canceled') {
      throw new ProviderGenerationFailedError(
        predictionId,
        `Replicate prediction ${predictionId} was canceled`,
      );
    }
    if (status === 'failed') {
      throw new ProviderGenerationFailedError(
        predictionId,
        replicatePredictionFailureMessage(
          predictionId,
          prediction.status,
          prediction.error,
        ),
      );
    }
    return null;
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
    const preparedInput = request.compiledDispatch ?? request.providerInput;
    if (!preparedInput)
      throw new Error('Image provider input was not prepared');
    const input = { ...preparedInput };

    // Compiled SeeDream dispatch omits request-scoped batch size. Overlay the
    // official Replicate fields so one provider call still asks for N images.
    if (
      request.compiledDispatch &&
      isBatchSupported &&
      !isImageEditModel(request.model)
    ) {
      Object.assign(input, {
        max_images: request.outputs,
        ...(request.outputs > 1 ? { sequential_image_generation: 'auto' } : {}),
      });
    }

    return {
      tracksSubmissionStarted: true,
      additionalActivityFailure: 'fail',
      additionalFailureLabel:
        'ReplicateService generateImage (additional output)',
      additionalPlaceholderFailureLabel: 'Replicate',
      completionKind: 'poll-multiple',
      failureLabel: 'ReplicateService generateImage',
      generate: async () => {
        const generationId = await this.replicateService.generateTextToImage(
          request.modelEndpoint ?? request.model,
          input,
          request.apiKeyOverride,
          request.onProviderSubmissionStarted,
        );
        if (!generationId) {
          throw new Error('No generation ID returned from Replicate');
        }
        await request.onExternalJobCreated?.(generationId);
        // Cloud + public webhook URL: leave completion to the Replicate
        // webhook (finishGeneration polls the DB). Local SaaS
        // (GENFEED_CLOUD=true with api.genfeed.localhost) and self-hosted
        // never receive provider webhooks, so poll Replicate and return
        // output URLs for immediate finalize/upload. BYOK predictions never
        // register the platform webhook, so they always poll with the org key.
        const shouldPollForOutput =
          Boolean(request.apiKeyOverride) ||
          shouldPollReplicatePrediction(
            isCloudDeployment(),
            canReceiveProviderWebhooks(),
          );
        const outputUrls = shouldPollForOutput
          ? await this.waitForLocalPrediction(
              generationId,
              request.abortSignal,
              request.apiKeyOverride,
              request.onProviderOutput,
            )
          : undefined;

        return {
          externalId: generationId,
          kind: 'external-id',
          ...(outputUrls ? { outputUrls } : {}),
        };
      },
      outputStrategy: replicateImageOutputStrategy(isBatchSupported),
      trackAdditionalOutputsInResponse: isImageEditModel(request.model),
    };
  }
}
