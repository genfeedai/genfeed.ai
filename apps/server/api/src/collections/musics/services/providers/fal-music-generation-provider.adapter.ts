import { randomUUID } from 'node:crypto';
import {
  getFalEndpointFromModelKey,
  isFalDestination,
} from '@api/collections/models/utils/model-key.util';
import type {
  MusicGenerationProviderAdapter,
  MusicGenerationProviderRequest,
  MusicGenerationProviderResult,
} from '@api/collections/musics/services/music-generation.types';
import { FalService } from '@api/services/integrations/fal/services/fal.service';
import { ModelProvider } from '@genfeedai/contracts';
import { MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';

interface FalMusicResponseData extends Record<string, unknown> {
  audio?: { url?: string };
  audio_file?: { url?: string };
  output?: { url?: string };
  url?: string;
}

/**
 * fal.ai-hosted music providers (Eleven Music, Lyria 3 Pro). Unlike
 * Replicate, `FalService.run` blocks until the generation finishes and
 * returns the final audio URL directly — there is no separate webhook to
 * finalize the ingredient later, so this adapter reports `outputUrl` back
 * to the caller for immediate finalization.
 */
@Injectable()
export class FalMusicGenerationProviderAdapter
  implements MusicGenerationProviderAdapter
{
  readonly provider = 'fal' as const;

  constructor(private readonly falService: FalService) {}

  supports(model: string, provider?: ModelProvider | string): boolean {
    return isFalDestination(model, provider);
  }

  async generate(
    request: MusicGenerationProviderRequest,
  ): Promise<MusicGenerationProviderResult> {
    const endpoint = getFalEndpointFromModelKey(request.modelEndpoint);
    const duration = this.clampDuration(request.model, request.duration);
    const input = this.buildInput(endpoint, request, duration);

    const data = (await this.falService.run(endpoint, input)) as
      | FalMusicResponseData
      | undefined;
    const audioUrl =
      data?.audio?.url ??
      data?.audio_file?.url ??
      data?.output?.url ??
      data?.url;

    if (!audioUrl) {
      throw new Error(
        `fal.ai returned no audio for model ${endpoint}: ${JSON.stringify(data).substring(0, 200)}`,
      );
    }

    return { externalId: randomUUID(), outputUrl: audioUrl };
  }

  /**
   * Clamps the requested duration to the model's own advertised range
   * (`MODEL_OUTPUT_CAPABILITIES.durations`) instead of rejecting — our own
   * DTO already bounds duration to 4-90s, so a provider-specific floor (e.g.
   * Eleven Music's 10s minimum) is the only case that needs adjusting.
   */
  private clampDuration(model: string, requested: number): number {
    const durations = MODEL_OUTPUT_CAPABILITIES[model]?.durations;
    if (!durations?.length) {
      return requested;
    }
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    return Math.min(Math.max(requested, min), max);
  }

  /**
   * fal publishes a distinct schema per music model — Eleven Music accepts
   * `music_length_ms` + `instrumental`, Lyria 3 Pro accepts `duration`
   * (seconds). Both take a plain `prompt`.
   * @see https://fal.ai/learn/devs/elevenlabs-music-user-guide
   * @see https://fal.ai/learn/tools/best-text-to-music-apis-2026
   */
  private buildInput(
    endpoint: string,
    request: MusicGenerationProviderRequest,
    duration: number,
  ): Record<string, unknown> {
    if (endpoint.includes('elevenlabs')) {
      return {
        instrumental: request.createMusicDto.instrumental ?? false,
        music_length_ms: duration * 1000,
        prompt: request.prompt,
      };
    }

    return {
      duration,
      prompt: request.prompt,
      seed: request.seed >= 0 ? request.seed : undefined,
    };
  }
}
