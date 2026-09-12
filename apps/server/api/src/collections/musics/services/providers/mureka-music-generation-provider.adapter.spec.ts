import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import type { MusicGenerationProviderRequest } from '@api/collections/musics/services/music-generation.types';
import { MurekaMusicGenerationProviderAdapter } from '@api/collections/musics/services/providers/mureka-music-generation-provider.adapter';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

describe('MurekaMusicGenerationProviderAdapter', () => {
  const buildRequest = (
    overrides: Partial<MusicGenerationProviderRequest> = {},
  ): MusicGenerationProviderRequest => ({
    createMusicDto: Object.assign(new CreateMusicDto(), { text: 'a song' }),
    duration: 30,
    model: MODEL_KEYS.MUREKA_V9,
    modelCategory: ModelCategory.MUSIC,
    modelEndpoint: MODEL_KEYS.MUREKA_V9,
    modelProvider: ModelProvider.MUREKA,
    outputs: 1,
    prompt: 'a song',
    seed: -1,
    ...overrides,
  });

  it('supports only the Mureka provider', () => {
    const adapter = new MurekaMusicGenerationProviderAdapter({} as never);
    expect(adapter.supports(MODEL_KEYS.MUREKA_V9, ModelProvider.MUREKA)).toBe(
      true,
    );
    expect(adapter.supports(MODEL_KEYS.MUREKA_V9, ModelProvider.FAL)).toBe(
      false,
    );
    expect(adapter.supports(MODEL_KEYS.MUREKA_V9)).toBe(false);
  });

  it('delegates to MurekaService and returns the finished audio URL', async () => {
    const murekaService = {
      generateSong: vi.fn().mockResolvedValue({
        audioUrl: 'https://mureka.example.com/song.mp3',
        taskId: 'task-123',
      }),
    };
    const adapter = new MurekaMusicGenerationProviderAdapter(
      murekaService as never,
    );

    const result = await adapter.generate(buildRequest());

    expect(murekaService.generateSong).toHaveBeenCalledWith({
      instrumental: false,
      prompt: 'a song',
    });
    expect(result).toEqual({
      externalId: 'task-123',
      outputUrl: 'https://mureka.example.com/song.mp3',
    });
  });

  it('passes through the instrumental flag from the DTO', async () => {
    const murekaService = {
      generateSong: vi.fn().mockResolvedValue({
        audioUrl: 'https://mureka.example.com/song.mp3',
        taskId: 'task-123',
      }),
    };
    const adapter = new MurekaMusicGenerationProviderAdapter(
      murekaService as never,
    );

    await adapter.generate(
      buildRequest({
        createMusicDto: Object.assign(new CreateMusicDto(), {
          instrumental: true,
          text: 'a song',
        }),
      }),
    );

    expect(murekaService.generateSong).toHaveBeenCalledWith(
      expect.objectContaining({ instrumental: true }),
    );
  });

  it('passes through explicit lyrics from the DTO', async () => {
    const murekaService = {
      generateSong: vi.fn().mockResolvedValue({
        audioUrl: 'https://mureka.example.com/song.mp3',
        taskId: 'task-123',
      }),
    };
    const adapter = new MurekaMusicGenerationProviderAdapter(
      murekaService as never,
    );

    await adapter.generate(
      buildRequest({
        createMusicDto: Object.assign(new CreateMusicDto(), {
          lyrics: 'Verse one',
          text: 'a song',
        }),
      }),
    );

    expect(murekaService.generateSong).toHaveBeenCalledWith(
      expect.objectContaining({ lyrics: 'Verse one' }),
    );
  });

  it('drops lyrics when instrumental is requested', async () => {
    const murekaService = {
      generateSong: vi.fn().mockResolvedValue({
        audioUrl: 'https://mureka.example.com/song.mp3',
        taskId: 'task-123',
      }),
    };
    const adapter = new MurekaMusicGenerationProviderAdapter(
      murekaService as never,
    );

    await adapter.generate(
      buildRequest({
        createMusicDto: Object.assign(new CreateMusicDto(), {
          instrumental: true,
          lyrics: 'Verse one',
          text: 'a song',
        }),
      }),
    );

    expect(murekaService.generateSong).toHaveBeenCalledWith(
      expect.objectContaining({ lyrics: undefined }),
    );
  });
});
