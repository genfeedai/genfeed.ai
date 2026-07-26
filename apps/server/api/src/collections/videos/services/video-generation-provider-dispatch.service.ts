import { FalVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/fal-video-generation-provider.adapter';
import { KlingAiVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/klingai-video-generation-provider.adapter';
import { ReplicateVideoGenerationProviderAdapter } from '@api/collections/videos/services/providers/replicate-video-generation-provider.adapter';
import type {
  DispatchVideoGenerationParams,
  VideoGenerationProviderAdapter,
  VideoGenerationProviderResult,
} from '@api/collections/videos/services/video-generation.types';
import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoGenerationProviderDispatchService {
  private readonly adapters: readonly VideoGenerationProviderAdapter[];

  constructor(
    klingAiAdapter: KlingAiVideoGenerationProviderAdapter,
    falAdapter: FalVideoGenerationProviderAdapter,
    replicateAdapter: ReplicateVideoGenerationProviderAdapter,
  ) {
    this.adapters = [klingAiAdapter, falAdapter, replicateAdapter];
  }

  async dispatch(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult> {
    const adapter = this.adapters.find((candidate) =>
      candidate.supports(params.model),
    );
    if (!adapter) {
      throw new Error(`No video provider adapter for model ${params.model}`);
    }
    return adapter.generate(params);
  }
}
