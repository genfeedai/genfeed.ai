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

  const buildAdapter = (
    provider: 'fal' | 'mureka' | 'replicate',
    supportsResult = false,
  ) => ({
    generate: vi.fn(),
    provider,
    supports: vi.fn().mockReturnValue(supportsResult),
  });

  const buildRegistry = (overrides: {
    falAdapter?: ReturnType<typeof buildAdapter>;
    murekaAdapter?: ReturnType<typeof buildAdapter>;
    replicateAdapter?: ReturnType<typeof buildAdapter>;
  }) => {
    const falAdapter = overrides.falAdapter ?? buildAdapter('fal');
    const murekaAdapter = overrides.murekaAdapter ?? buildAdapter('mureka');
    const replicateAdapter =
      overrides.replicateAdapter ?? buildAdapter('replicate');
    const registry = new MusicGenerationProviderRegistryService(
      falAdapter as never,
      murekaAdapter as never,
      replicateAdapter as never,
    );
    return { falAdapter, murekaAdapter, registry, replicateAdapter };
  };

  it('delegates supports() to the registered adapter', () => {
    const replicateAdapter = buildAdapter('replicate', true);
    const { registry } = buildRegistry({ replicateAdapter });

    expect(registry.supports('meta/musicgen', ModelProvider.REPLICATE)).toBe(
      true,
    );
    expect(replicateAdapter.supports).toHaveBeenCalledWith(
      'meta/musicgen',
      ModelProvider.REPLICATE,
    );
  });

  it('dispatches generate() to the adapter that supports the model', async () => {
    const replicateAdapter = buildAdapter('replicate', true);
    replicateAdapter.generate.mockResolvedValue({ externalId: 'generation-1' });
    const { registry } = buildRegistry({ replicateAdapter });

    const result = await registry.generate(buildRequest());

    expect(replicateAdapter.generate).toHaveBeenCalledWith(buildRequest());
    expect(result).toEqual({ externalId: 'generation-1' });
  });

  it('dispatches generate() to the fal adapter when it supports the model', async () => {
    const falAdapter = buildAdapter('fal', true);
    falAdapter.generate.mockResolvedValue({
      externalId: 'gen-1',
      outputUrl: 'https://cdn.example.com/track.mp3',
    });
    const replicateAdapter = buildAdapter('replicate', false);
    const { registry } = buildRegistry({ falAdapter, replicateAdapter });

    const result = await registry.generate(buildRequest() as never);

    expect(falAdapter.generate).toHaveBeenCalled();
    expect(replicateAdapter.generate).not.toHaveBeenCalled();
    expect(result).toEqual({
      externalId: 'gen-1',
      outputUrl: 'https://cdn.example.com/track.mp3',
    });
  });

  it('dispatches generate() to the Mureka adapter when it supports the model', async () => {
    const murekaAdapter = buildAdapter('mureka', true);
    murekaAdapter.generate.mockResolvedValue({
      externalId: 'task-1',
      outputUrl: 'https://cdn.example.com/song.mp3',
    });
    const { registry } = buildRegistry({ murekaAdapter });

    const result = await registry.generate(buildRequest());

    expect(murekaAdapter.generate).toHaveBeenCalled();
    expect(result).toEqual({
      externalId: 'task-1',
      outputUrl: 'https://cdn.example.com/song.mp3',
    });
  });

  it('resolves the provider name for the adapter that supports the model', () => {
    const replicateAdapter = buildAdapter('replicate', true);
    const { registry } = buildRegistry({ replicateAdapter });

    expect(registry.providerFor('meta/musicgen', ModelProvider.REPLICATE)).toBe(
      'replicate',
    );
  });

  it('returns null from providerFor when no adapter supports the model', () => {
    const { registry } = buildRegistry({});

    expect(registry.providerFor('unknown/model')).toBeNull();
  });

  it('throws when no adapter supports the resolved model', async () => {
    const { registry } = buildRegistry({});

    await expect(registry.generate(buildRequest())).rejects.toThrow(
      'No music generation provider adapter for model: meta/musicgen',
    );
  });
});
