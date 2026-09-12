import type {
  MusicGenerationProvider,
  MusicGenerationProviderAdapter,
  MusicGenerationProviderRequest,
  MusicGenerationProviderResult,
} from '@api/collections/musics/services/music-generation.types';
import { ReplicateMusicGenerationProviderAdapter } from '@api/collections/musics/services/providers/replicate-music-generation-provider.adapter';
import type { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/**
 * Resolves the music provider adapter for a registry-resolved model and
 * dispatches generation to it. Mirrors the image/video generation provider
 * registries so music gains the same provider-neutral dispatch story.
 */
@Injectable()
export class MusicGenerationProviderRegistryService {
  private readonly adapters: readonly MusicGenerationProviderAdapter[];

  constructor(replicateAdapter: ReplicateMusicGenerationProviderAdapter) {
    this.adapters = [replicateAdapter];
  }

  supports(model: string, provider?: ModelProvider | string): boolean {
    return this.adapters.some((adapter) => adapter.supports(model, provider));
  }

  providerFor(
    model: string,
    provider?: ModelProvider | string,
  ): MusicGenerationProvider | null {
    return (
      this.adapters.find((candidate) => candidate.supports(model, provider))
        ?.provider ?? null
    );
  }

  async generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult> {
    const adapter = this.adapters.find((candidate) =>
      candidate.supports(request.model, request.modelProvider),
    );

    if (!adapter) {
      throw new Error(
        `No music generation provider adapter for model: ${request.model}`,
      );
    }

    return adapter.generate(request);
  }
}
