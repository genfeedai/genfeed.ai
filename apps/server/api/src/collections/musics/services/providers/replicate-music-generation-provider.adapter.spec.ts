import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { MusicGenerationProviderRequest } from '@api/collections/musics/services/music-generation.types';
import { ReplicateMusicGenerationProviderAdapter } from '@api/collections/musics/services/providers/replicate-music-generation-provider.adapter';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';

describe('ReplicateMusicGenerationProviderAdapter', () => {
  const buildRequest = (
    overrides: Partial<MusicGenerationProviderRequest> = {},
  ): MusicGenerationProviderRequest => ({
    createMusicDto: Object.assign(new CreateMusicDto(), {
      text: 'upbeat electronic music',
    }),
    duration: 10,
    model: 'meta/musicgen',
    modelCategory: ModelCategory.MUSIC,
    modelEndpoint: 'meta/musicgen',
    modelProvider: ModelProvider.REPLICATE,
    outputs: 1,
    prompt: 'upbeat electronic music',
    seed: -1,
    ...overrides,
  });

  describe('supports', () => {
    it('claims models by explicit provider', () => {
      const adapter = new ReplicateMusicGenerationProviderAdapter(
        {} as never,
        {} as never,
      );
      expect(adapter.supports('meta/musicgen', ModelProvider.REPLICATE)).toBe(
        true,
      );
      expect(adapter.supports('meta/musicgen', ModelProvider.FAL)).toBe(false);
    });

    it('falls back to key-shape detection when no provider is given', () => {
      const adapter = new ReplicateMusicGenerationProviderAdapter(
        {} as never,
        {} as never,
      );
      expect(adapter.supports('meta/musicgen')).toBe(true);
      expect(adapter.supports('fal-ai/elevenlabs/music')).toBe(false);
    });
  });

  describe('generate', () => {
    it('builds the prompt via the registry endpoint and runs it on Replicate', async () => {
      const promptBuilderService = {
        buildPrompt: vi.fn().mockResolvedValue({
          input: { prompt: 'built prompt' },
        }),
      };
      const replicateService = {
        runModel: vi.fn().mockResolvedValue('generation-1'),
      };
      const adapter = new ReplicateMusicGenerationProviderAdapter(
        promptBuilderService as never,
        replicateService as never,
      );

      const result = await adapter.generate(
        buildRequest({ modelEndpoint: 'meta/musicgen' }),
      );

      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        'meta/musicgen',
        expect.objectContaining({
          duration: 10,
          modelCategory: ModelCategory.MUSIC,
          prompt: 'upbeat electronic music',
          seed: -1,
        }),
      );
      expect(replicateService.runModel).toHaveBeenCalledWith('meta/musicgen', {
        prompt: 'built prompt',
      });
      expect(result).toEqual({ externalId: 'generation-1' });
    });

    it('passes through supported DTO sampling params', async () => {
      const promptBuilderService = {
        buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
      };
      const replicateService = {
        runModel: vi.fn().mockResolvedValue('generation-1'),
      };
      const adapter = new ReplicateMusicGenerationProviderAdapter(
        promptBuilderService as never,
        replicateService as never,
      );

      await adapter.generate(
        buildRequest({
          createMusicDto: Object.assign(new CreateMusicDto(), {
            classifierFreeGuidance: 5,
            modelVersion: 'melody',
            temperature: 0.7,
            text: 'music',
            topK: 100,
            topP: 0.9,
          }),
        }),
      );

      expect(promptBuilderService.buildPrompt).toHaveBeenCalledWith(
        'meta/musicgen',
        expect.objectContaining({
          classifierFreeGuidance: 5,
          modelVersion: 'melody',
          temperature: 0.7,
          topK: 100,
          topP: 0.9,
        }),
      );
    });

    it('throws when Replicate returns no generation id', async () => {
      const promptBuilderService = {
        buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
      };
      const replicateService = {
        runModel: vi.fn().mockResolvedValue(null),
      };
      const adapter = new ReplicateMusicGenerationProviderAdapter(
        promptBuilderService as never,
        replicateService as never,
      );

      await expect(adapter.generate(buildRequest())).rejects.toThrow(
        'No generation ID returned from Replicate',
      );
    });
  });
});
