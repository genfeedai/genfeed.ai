import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type {
  ImageGenerationProvider,
  ImageGenerationProviderAdapter,
  ImageGenerationProviderRequest,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
import { CrunImageGenerationProviderAdapter } from '@api/collections/images/services/providers/crun-image-generation-provider.adapter';
import { FalImageGenerationProviderAdapter } from '@api/collections/images/services/providers/fal-image-generation-provider.adapter';
import { GenfeedAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/genfeedai-image-generation-provider.adapter';
import { HiggsFieldImageGenerationProviderAdapter } from '@api/collections/images/services/providers/higgsfield-image-generation-provider.adapter';
import { KlingAiImageGenerationProviderAdapter } from '@api/collections/images/services/providers/klingai-image-generation-provider.adapter';
import { LeonardoImageGenerationProviderAdapter } from '@api/collections/images/services/providers/leonardo-image-generation-provider.adapter';
import { ReplicateImageGenerationProviderAdapter } from '@api/collections/images/services/providers/replicate-image-generation-provider.adapter';
import { SdxlImageGenerationProviderAdapter } from '@api/collections/images/services/providers/sdxl-image-generation-provider.adapter';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { ModelProvider } from '@genfeedai/contracts';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
} from '@nestjs/common';

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
    @Optional()
    private readonly crunAdapter?: CrunImageGenerationProviderAdapter,
  ) {
    this.adapters = [
      genfeedAiAdapter,
      klingAiAdapter,
      higgsFieldAdapter,
      falAdapter,
      leonardoAdapter,
      replicateAdapter,
      sdxlAdapter,
      ...(this.crunAdapter ? [this.crunAdapter] : []),
    ];
  }

  generateCrunQuoted(
    user: AuthenticatedUser,
    dto: CreateImageDto,
    request: RequestWithContext,
    hasUnsupportedContext: boolean,
  ) {
    if (hasUnsupportedContext)
      throw new HttpException(
        { code: 'CRUN_INVALID_INPUT' },
        HttpStatus.BAD_REQUEST,
      );
    if (!this.crunAdapter)
      throw new HttpException(
        { code: 'CRUN_MODEL_UNAVAILABLE' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return this.crunAdapter.generateQuoted(user, dto, request);
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
