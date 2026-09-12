import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicGenerationProviderRegistryService } from '@api/collections/musics/services/music-generation-provider-registry.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';

describe('MusicGenerationProviderRegistryService', () => {
  const buildRequest = () => ({
    createMusicDto: Object.assign(new CreateMusicDto(), { text: 'music' }),
    duration: 10,
    model: 'meta/musicgen',
    modelCategory: ModelCategory.MUSIC,
    modelEndpoint: 'meta/musicgen',
    modelProvider: ModelProvider.REPLICATE,
    outputs: 1,
    prompt: 'music',
    seed: -1,
  });

  it('delegates supports() to the registered adapter', () => {
    const replicateAdapter = {
      generate: vi.fn(),
      provider: 'replicate' as const,
      supports: vi.fn().mockReturnValue(true),
    };
    const registry = new MusicGenerationProviderRegistryService(
      replicateAdapter as never,
    );

    expect(registry.supports('meta/musicgen', ModelProvider.REPLICATE)).toBe(
      true,
    );
    expect(replicateAdapter.supports).toHaveBeenCalledWith(
      'meta/musicgen',
      ModelProvider.REPLICATE,
    );
  });

  it('dispatches generate() to the adapter that supports the model', async () => {
    const replicateAdapter = {
      generate: vi.fn().mockResolvedValue({ externalId: 'generation-1' }),
      provider: 'replicate' as const,
      supports: vi.fn().mockReturnValue(true),
    };
    const registry = new MusicGenerationProviderRegistryService(
      replicateAdapter as never,
    );

    const result = await registry.generate(buildRequest());

    expect(replicateAdapter.generate).toHaveBeenCalledWith(buildRequest());
    expect(result).toEqual({ externalId: 'generation-1' });
  });

  it('resolves the provider name for the adapter that supports the model', () => {
    const replicateAdapter = {
      generate: vi.fn(),
      provider: 'replicate' as const,
      supports: vi.fn().mockReturnValue(true),
    };
    const registry = new MusicGenerationProviderRegistryService(
      replicateAdapter as never,
    );

    expect(registry.providerFor('meta/musicgen', ModelProvider.REPLICATE)).toBe(
      'replicate',
    );
  });

  it('returns null from providerFor when no adapter supports the model', () => {
    const replicateAdapter = {
      generate: vi.fn(),
      provider: 'replicate' as const,
      supports: vi.fn().mockReturnValue(false),
    };
    const registry = new MusicGenerationProviderRegistryService(
      replicateAdapter as never,
    );

    expect(registry.providerFor('unknown/model')).toBeNull();
  });

  it('throws when no adapter supports the resolved model', async () => {
    const replicateAdapter = {
      generate: vi.fn(),
      provider: 'replicate' as const,
      supports: vi.fn().mockReturnValue(false),
    };
    const registry = new MusicGenerationProviderRegistryService(
      replicateAdapter as never,
    );

    await expect(registry.generate(buildRequest())).rejects.toThrow(
      'No music generation provider adapter for model: meta/musicgen',
    );
  });
});
