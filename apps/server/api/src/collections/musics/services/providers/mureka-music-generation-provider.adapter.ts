import type {
  MusicGenerationPreflightRequest,
  MusicGenerationProviderAdapter,
  MusicGenerationProviderRequest,
  MusicGenerationProviderResult,
} from '@api/collections/musics/services/music-generation.types';
import {
  MurekaService,
  murekaPromptMaxLength,
} from '@api/services/integrations/mureka/services/mureka.service';
import { ModelProvider } from '@genfeedai/contracts';
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
import { BadRequestException, Injectable } from '@nestjs/common';

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

  assertSupported(request: MusicGenerationPreflightRequest): void {
    const maxLength = murekaPromptMaxLength(request);
    if (request.prompt.length > maxLength) {
      throw new BadRequestException({
        detail: `Mureka accepts prompts up to ${maxLength} characters for this request (style included); this one has ${request.prompt.length}.`,
        title: 'Prompt too long',
      });
    }
  }

  async generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult> {
    const normalized = normalizeMusicSettings(
      request.model,
      request.createMusicDto,
    );
    const instrumental = normalized.instrumental;
    const result = await this.murekaService.generateSong({
      instrumental,
      // An instrumental request carries no lyrics, even if the field still
      // holds stale text from before the toggle was flipped.
      lyrics: normalized.lyrics?.trim() || undefined,
      prompt: request.prompt,
    });

    return { externalId: result.taskId, outputUrl: result.audioUrl };
  }
}
