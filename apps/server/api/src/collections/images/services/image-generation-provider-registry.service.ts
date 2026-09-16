import type {
  ImageGenerationProvider,
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import type { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ImageGenerationProviderRegistryService {
  private readonly adapters: readonly ImageGenerationProviderAdapter[];

  constructor(
    genfeedAiAdapter: GenfeedAiImageGenerationProviderAdapter,
    klingAiAdapter: KlingAiImageGenerationProviderAdapter,
    falAdapter: FalImageGenerationProviderAdapter,
    leonardoAdapter: LeonardoImageGenerationProviderAdapter,
    replicateAdapter: ReplicateImageGenerationProviderAdapter,
    sdxlAdapter: SdxlImageGenerationProviderAdapter,
    higgsFieldAdapter: HiggsFieldImageGenerationProviderAdapter,
  ) {
    this.adapters = [
      genfeedAiAdapter,
      klingAiAdapter,
      higgsFieldAdapter,
      falAdapter,
      leonardoAdapter,
      replicateAdapter,
      sdxlAdapter,
    ];
  }

  supports(model: string, provider?: ModelProvider | string): boolean {
    return this.providerFor(model, provider) !== null;
  }

  /** Dispatch and billing share `resolveImageGenerationProvider` (#4813). */
  providerFor(
    model: string,
    provider?: ModelProvider | string,
  ): ImageGenerationProvider | null {
    return resolveImageGenerationProvider(model, provider);
  }

  async prepare(
    request: ImageGenerationProviderRequest,
  ): Promise<PreparedImageGenerationProvider | null> {
    const provider = this.providerFor(request.model, request.modelProvider);
    const adapter = this.adapters.find(
      (candidate) => candidate.provider === provider,
    );
    return adapter ? adapter.prepare(request) : null;
  }
}
