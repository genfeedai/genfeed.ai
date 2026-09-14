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
import { normalizeMusicSettings } from '@genfeedai/contracts/constants';
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
    const normalized = normalizeMusicSettings(request.model, {
      ...request.createMusicDto,
      duration: request.duration,
    });
    const input = this.buildInput(
      endpoint,
      {
        ...request,
        createMusicDto: { ...request.createMusicDto, ...normalized },
      },
      normalized.duration,
    );

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
   * fal publishes a distinct schema per music model. Eleven Music accepts
   * `music_length_ms` + `force_instrumental` alongside `prompt`. Lyria 3
   * Pro's schema is only `{ prompt, image_url }` — it has no duration,
   * seed, instrumental, or lyrics parameter, so all of those are folded
   * into the prompt text instead of sent as (silently-dropped) fields.
   * @see https://fal.ai/models/fal-ai/elevenlabs/music/api
   * @see https://fal.ai/models/fal-ai/lyria3/pro/api
   */
  private buildInput(
    endpoint: string,
    request: MusicGenerationProviderRequest,
    duration: number | undefined,
  ): Record<string, unknown> {
    const instrumental = request.createMusicDto.instrumental;
    const prompt = this.buildPromptWithLyrics(
      request.prompt,
      instrumental ? undefined : request.createMusicDto.lyrics,
    );

    if (endpoint.includes('elevenlabs')) {
      return {
        force_instrumental: instrumental,
        music_length_ms: duration === undefined ? undefined : duration * 1000,
        prompt,
      };
    }

    return {
      prompt: this.withLyriaInstrumentalHint(prompt, instrumental === true),
    };
  }

  /**
   * Lyria 3 Pro has no dedicated instrumental toggle, so an instrumental
   * request is expressed as a prompt directive instead of a parameter.
   */
  private withLyriaInstrumentalHint(
    prompt: string,
    instrumental: boolean,
  ): string {
    return instrumental
      ? `${prompt} (instrumental, no vocals or lyrics)`
      : prompt;
  }

  private buildPromptWithLyrics(prompt: string, lyrics?: string): string {
    const trimmedLyrics = lyrics?.trim();
    return trimmedLyrics ? `${prompt}\n\nLyrics:\n${trimmedLyrics}` : prompt;
  }
}
