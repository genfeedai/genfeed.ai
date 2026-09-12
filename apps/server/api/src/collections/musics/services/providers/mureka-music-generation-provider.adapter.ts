import type {
  MusicGenerationProviderAdapter,
  MusicGenerationProviderRequest,
  MusicGenerationProviderResult,
} from '@api/collections/musics/services/music-generation.types';
import { MurekaService } from '@api/services/integrations/mureka/services/mureka.service';
import { ModelProvider } from '@genfeedai/contracts';
import { Injectable } from '@nestjs/common';

/**
 * Mureka V9 direct API integration (not fal/Replicate). `MurekaService`
 * polls to completion internally, so — like the fal adapter — this reports
 * `outputUrl` back to the caller for immediate finalization rather than
 * waiting on a webhook.
 */
@Injectable()
export class MurekaMusicGenerationProviderAdapter
  implements MusicGenerationProviderAdapter
{
  readonly provider = 'mureka' as const;

  constructor(private readonly murekaService: MurekaService) {}

  supports(_model: string, provider?: ModelProvider | string): boolean {
    return provider === ModelProvider.MUREKA;
  }

  async generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult> {
    const instrumental = request.createMusicDto.instrumental ?? false;
    const result = await this.murekaService.generateSong({
      instrumental,
      // An instrumental request carries no lyrics, even if the field still
      // holds stale text from before the toggle was flipped.
      lyrics: instrumental
        ? undefined
        : request.createMusicDto.lyrics || undefined,
      prompt: request.prompt,
    });

    return { externalId: result.taskId, outputUrl: result.audioUrl };
  }
}
