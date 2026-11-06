import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { MusicGenerationProviderRequest } from '@api/collections/musics/services/music-generation.types';
import { FalMusicGenerationProviderAdapter } from '@api/collections/musics/services/providers/fal-music-generation-provider.adapter';
import type { FalService } from '@api/services/integrations/fal/services/fal.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

interface FalRun {
  apiKey: string | undefined;
  endpoint: string;
  input: Record<string, unknown>;
}

describe('FalMusicGenerationProviderAdapter', () => {
  let runs: FalRun[];
  let falResponse: Record<string, unknown>;
  let adapter: FalMusicGenerationProviderAdapter;

  const buildRequest = (
    overrides: Partial<MusicGenerationProviderRequest> = {},
  ): MusicGenerationProviderRequest => ({
    createMusicDto: Object.assign(new CreateMusicDto(), {
      text: 'upbeat electronic music',
    }),
    duration: 30,
    model: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    modelCategory: ModelCategory.MUSIC,
    modelEndpoint: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    modelProvider: ModelProvider.FAL,
    outputs: 1,
    prompt: 'upbeat electronic music',
    seed: -1,
    ...overrides,
  });

  beforeEach(() => {
    runs = [];
    falResponse = { url: 'https://fal.example.com/a.mp3' };
    adapter = new FalMusicGenerationProviderAdapter({
      run: async (
        endpoint: string,
        input: Record<string, unknown>,
        apiKey?: string,
      ) => {
        runs.push({ apiKey, endpoint, input });
        return falResponse;
      },
    } as unknown as FalService);
  });

  describe('supports', () => {
    it.each([
      [MODEL_KEYS.FAL_ELEVENLABS_MUSIC, true],
      [MODEL_KEYS.FAL_LYRIA3_PRO, true],
      ['meta/musicgen', false],
    ])('answers %s with %s', (model, expected) => {
      expect(adapter.supports(model)).toBe(expected);
    });
  });

  // #4733: the registry row's endpoint is case-normalized before dispatch.
  // Missing or malformed metadata must fail closed, never surface a TypeError.
  describe('generate — malformed registry endpoint', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a number', 42],
      ['an empty string', ''],
    ])(
      'rejects an endpoint of %s with a 400 before calling fal',
      async (_label, modelEndpoint) => {
        await expect(
          adapter.generate(
            buildRequest({ modelEndpoint: modelEndpoint as unknown as string }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(runs).toEqual([]);
      },
    );

    it('still dispatches a valid endpoint with a different case', async () => {
      await adapter.generate(
        buildRequest({ modelEndpoint: 'FAL/elevenlabs/music' }),
      );

      expect(runs).toEqual([
        expect.objectContaining({
          apiKey: undefined,
          endpoint: 'elevenlabs/music',
          input: expect.objectContaining({
            prompt: 'upbeat electronic music',
          }),
        }),
      ]);
    });
  });

  it("runs on the organization's own key when one is supplied", async () => {
    await adapter.generate(buildRequest({ apiKeyOverride: 'byok-key' }));

    expect(runs).toEqual([
      expect.objectContaining({
        apiKey: 'byok-key',
        endpoint: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
      }),
    ]);
  });

  describe('generate — Eleven Music', () => {
    it('builds music_length_ms from duration and returns the audio URL', async () => {
      falResponse = { audio: { url: 'https://fal.example.com/track.mp3' } };

      const result = await adapter.generate(buildRequest({ duration: 30 }));

      expect(runs).toEqual([
        {
          apiKey: undefined,
          endpoint: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
          input: expect.objectContaining({
            force_instrumental: false,
            music_length_ms: 30_000,
            prompt: 'upbeat electronic music',
          }),
        },
      ]);
      expect(result.outputUrl).toBe('https://fal.example.com/track.mp3');
      expect(result.externalId).toEqual(expect.any(String));
    });

    it('clamps duration below the model minimum (10s)', async () => {
      await adapter.generate(buildRequest({ duration: 4 }));

      expect(runs[0]?.input.music_length_ms).toBe(10_000);
    });

    it.each([
      [
        'passes through the instrumental flag',
        { instrumental: true, text: 'music' },
        { force_instrumental: true, prompt: 'upbeat electronic music' },
      ],
      [
        'folds explicit lyrics into the prompt (no dedicated fal field)',
        { lyrics: 'Verse one\nChorus', text: 'music' },
        { prompt: expect.stringContaining('Verse one\nChorus') },
      ],
      [
        'drops lyrics when instrumental is requested',
        { instrumental: true, lyrics: 'Verse one', text: 'music' },
        { prompt: 'upbeat electronic music' },
      ],
    ])('%s', async (_case, dto, expectedInput) => {
      await adapter.generate(
        buildRequest({
          createMusicDto: Object.assign(new CreateMusicDto(), dto),
        }),
      );

      expect(runs[0]?.input).toEqual(expect.objectContaining(expectedInput));
    });
  });

  describe('generate — Lyria 3 Pro', () => {
    it('sends only prompt — Lyria has no duration/seed/instrumental input fields', async () => {
      falResponse = {
        audio_file: { url: 'https://fal.example.com/lyria.mp3' },
      };

      const result = await adapter.generate(
        buildRequest({
          duration: 45,
          model: MODEL_KEYS.FAL_LYRIA3_PRO,
          modelEndpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
          seed: 7,
        }),
      );

      expect(runs).toEqual([
        {
          apiKey: undefined,
          endpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
          input: { prompt: 'upbeat electronic music' },
        },
      ]);
      expect(result.outputUrl).toBe('https://fal.example.com/lyria.mp3');
    });

    it('folds an instrumental hint into the prompt text instead of sending an unsupported field', async () => {
      await adapter.generate(
        buildRequest({
          createMusicDto: Object.assign(new CreateMusicDto(), {
            instrumental: true,
            text: 'ambient soundscape',
          }),
          model: MODEL_KEYS.FAL_LYRIA3_PRO,
          modelEndpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
          prompt: 'ambient soundscape',
        }),
      );

      expect(runs[0]?.input).toEqual({
        prompt: 'ambient soundscape (instrumental, no vocals or lyrics)',
      });
    });
  });

  it('throws when fal returns no audio URL', async () => {
    falResponse = {};

    await expect(adapter.generate(buildRequest())).rejects.toThrow(
      /returned no audio/,
    );
  });
});
