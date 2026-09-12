import { isReplicateDestination } from '@api/collections/models/utils/model-key.util';
import type {
  MusicGenerationProviderAdapter,
  MusicGenerationProviderRequest,
  MusicGenerationProviderResult,
} from '@api/collections/musics/services/music-generation.types';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/**
 * Replicate music generation (MusicGen and any future Replicate-hosted music
 * model). Builds the provider-specific input from the registry-resolved
 * model and executes against the registry row's own endpoint — never a
 * hardcoded model/version constant.
 */
@Injectable()
export class ReplicateMusicGenerationProviderAdapter
  implements MusicGenerationProviderAdapter
{
  readonly provider = 'replicate' as const;

  constructor(
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
  ) {}

  supports(model: string, provider?: ModelProvider | string): boolean {
    if (provider) {
      return provider === ModelProvider.REPLICATE;
    }
    return isReplicateDestination(model);
  }

  async generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult> {
    const { input } = await this.promptBuilderService.buildPrompt(
      request.model,
      {
        classifierFreeGuidance: request.createMusicDto.classifierFreeGuidance,
        duration: request.duration,
        modelCategory: request.modelCategory,
        modelVersion: request.createMusicDto.modelVersion,
        prompt: request.prompt,
        seed: request.seed,
        temperature: request.createMusicDto.temperature,
        topK: request.createMusicDto.topK,
        topP: request.createMusicDto.topP,
      },
    );

    const generationId = await this.replicateService.runModel(
      request.modelEndpoint,
      input,
    );

    if (!generationId) {
      throw new Error('No generation ID returned from Replicate');
    }

    return { externalId: generationId };
  }
}
