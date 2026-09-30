import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { resolveImageBillableOutputs } from '@api/collections/images/services/image-generation-provider.util';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { calculateAspectRatio } from '@genfeedai/helpers';

/**
 * Higgsfield Soul text-to-image. `generateTextToImage` queues the job and
 * `waitForImageCompletion` polls it internally, so this adapter blocks on the
 * whole round trip and returns the resolved image URLs as `outputUrls` — that
 * makes `ImageGenerationProviderDispatchService.finalizeReturnedOutput` upload
 * and finalize the ingredient the same way every other `external-id` provider
 * does, with no additional wiring.
 *
 * The current dispatch manifest funds one output. Native batches require an
 * explicit funded manifest before they can be admitted.
 */
export class HiggsFieldImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'higgsfield' as const;

  constructor(private readonly higgsFieldService: HiggsFieldService) {}

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    resolveImageBillableOutputs(this.provider, request.outputs);
    return {
      tracksSubmissionStarted: true,
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'HiggsFieldService generateTextToImage',
      additionalPlaceholderFailureLabel: 'Higgsfield',
      completionKind: 'poll-single',
      failureLabel: 'HiggsFieldService generateTextToImage',
      generate: async () => {
        const { requestId } = await this.higgsFieldService.generateTextToImage({
          aspectRatio: calculateAspectRatio(request.width, request.height),
          batchSize: 1,
          ...(request.onProviderSubmissionStarted
            ? {
                onProviderSubmissionStarted:
                  request.onProviderSubmissionStarted,
              }
            : {}),
          organizationId: request.organizationId,
          prompt: request.prompt,
        });

        const { imageUrls } =
          await this.higgsFieldService.waitForImageCompletion(requestId, {
            organizationId: request.organizationId,
          });

        return {
          externalId: requestId,
          kind: 'external-id',
          outputUrls: imageUrls,
          promptId: request.promptId,
        };
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
