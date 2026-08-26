import type {
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { calculateAspectRatio } from '@genfeedai/helpers';

/**
 * Higgsfield Soul text-to-image. `generateTextToImage` queues the job and
 * `waitForImageCompletion` polls it internally, so this adapter blocks on the
 * whole round trip and returns the resolved image URL as `outputUrls` — that
 * makes `ImageGenerationProviderDispatchService.finalizeReturnedOutput` upload
 * and finalize the ingredient the same way every other `external-id` provider
 * does, with no additional wiring.
 */
export class HiggsFieldImageGenerationProviderAdapter
  implements ImageGenerationProviderAdapter
{
  readonly provider = 'higgsfield' as const;

  constructor(private readonly higgsFieldService: HiggsFieldService) {}

  supports(model: string): boolean {
    return model === MODEL_KEYS.HIGGSFIELD_SOUL;
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider> {
    return {
      additionalActivityFailure: 'fail',
      additionalFailureLabel: 'HiggsFieldService generateTextToImage',
      additionalPlaceholderFailureLabel: 'Higgsfield',
      completionKind: 'poll-single',
      failureLabel: 'HiggsFieldService generateTextToImage',
      generate: async () => {
        const { requestId } = await this.higgsFieldService.generateTextToImage({
          aspectRatio: calculateAspectRatio(request.width, request.height),
          organizationId: request.organizationId,
          prompt: request.prompt,
        });

        const { imageUrl } =
          await this.higgsFieldService.waitForImageCompletion(requestId, {
            organizationId: request.organizationId,
          });

        return {
          externalId: requestId,
          kind: 'external-id',
          outputUrls: [imageUrl],
          promptId: request.promptId,
        };
      },
      outputStrategy: 'single',
      trackAdditionalOutputsInResponse: false,
    };
  }
}
