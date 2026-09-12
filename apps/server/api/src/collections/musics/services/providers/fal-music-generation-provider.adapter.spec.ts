import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { MusicGenerationProviderRequest } from '@api/collections/musics/services/music-generation.types';
import { FalMusicGenerationProviderAdapter } from '@api/collections/musics/services/providers/fal-music-generation-provider.adapter';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

describe('FalMusicGenerationProviderAdapter', () => {
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

  describe('supports', () => {
    it('claims fal-hosted music models', () => {
      const adapter = new FalMusicGenerationProviderAdapter({} as never);
      expect(adapter.supports(MODEL_KEYS.FAL_ELEVENLABS_MUSIC)).toBe(true);
      expect(adapter.supports(MODEL_KEYS.FAL_LYRIA3_PRO)).toBe(true);
      expect(adapter.supports('meta/musicgen')).toBe(false);
    });
  });

  describe('generate — Eleven Music', () => {
    it('builds music_length_ms from duration and returns the audio URL', async () => {
      const falService = {
        run: vi.fn().mockResolvedValue({
          audio: { url: 'https://fal.example.com/track.mp3' },
        }),
      };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

      const result = await adapter.generate(buildRequest({ duration: 30 }));

      expect(falService.run).toHaveBeenCalledWith(
        MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
        expect.objectContaining({
          force_instrumental: false,
          music_length_ms: 30_000,
          prompt: 'upbeat electronic music',
        }),
      );
      expect(result.outputUrl).toBe('https://fal.example.com/track.mp3');
      expect(result.externalId).toEqual(expect.any(String));
    });

    it('clamps duration below the model minimum (10s)', async () => {
      const falService = {
        run: vi
          .fn()
          .mockResolvedValue({ url: 'https://fal.example.com/a.mp3' }),
      };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

      await adapter.generate(buildRequest({ duration: 4 }));

      expect(falService.run).toHaveBeenCalledWith(
        MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
        expect.objectContaining({ music_length_ms: 10_000 }),
      );
    });

    it('passes through the instrumental flag from the DTO', async () => {
      const falService = {
        run: vi
          .fn()
          .mockResolvedValue({ url: 'https://fal.example.com/a.mp3' }),
      };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

      await adapter.generate(
        buildRequest({
          createMusicDto: Object.assign(new CreateMusicDto(), {
            instrumental: true,
            text: 'music',
          }),
        }),
      );

      expect(falService.run).toHaveBeenCalledWith(
        MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
        expect.objectContaining({ force_instrumental: true }),
      );
    });
  });

  describe('generate — Lyria 3 Pro', () => {
    it('sends only prompt — Lyria has no duration/seed/instrumental input fields', async () => {
      const falService = {
        run: vi.fn().mockResolvedValue({
          audio_file: { url: 'https://fal.example.com/lyria.mp3' },
        }),
      };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

      const result = await adapter.generate(
        buildRequest({
          duration: 45,
          model: MODEL_KEYS.FAL_LYRIA3_PRO,
          modelEndpoint: MODEL_KEYS.FAL_LYRIA3_PRO,
          seed: 7,
        }),
      );

      expect(falService.run).toHaveBeenCalledWith(MODEL_KEYS.FAL_LYRIA3_PRO, {
        prompt: 'upbeat electronic music',
      });
      expect(result.outputUrl).toBe('https://fal.example.com/lyria.mp3');
    });

    it('folds an instrumental hint into the prompt text instead of sending an unsupported field', async () => {
      const falService = {
        run: vi
          .fn()
          .mockResolvedValue({ url: 'https://fal.example.com/lyria.mp3' }),
      };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

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

      expect(falService.run).toHaveBeenCalledWith(MODEL_KEYS.FAL_LYRIA3_PRO, {
        prompt: 'ambient soundscape (instrumental, no vocals or lyrics)',
      });
    });
  });

  describe('generate — failures', () => {
    it('throws when fal returns no audio URL', async () => {
      const falService = { run: vi.fn().mockResolvedValue({}) };
      const adapter = new FalMusicGenerationProviderAdapter(
        falService as never,
      );

      await expect(adapter.generate(buildRequest())).rejects.toThrow(
        /returned no audio/,
      );
    });
  });
});
