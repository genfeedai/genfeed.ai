import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

const sdk = {
  auth: vi.fn(),
  createGeneration: vi.fn(),
  createImageToVideoGeneration: vi.fn(),
  createReworkGeneration: vi.fn(),
  createVideoGeneration: vi.fn(),
  getGenerationById: vi.fn(),
};

vi.mock('api', () => ({ default: vi.fn(() => sdk) }));

const { LeonardoAIService } = await import('./leonardoai.service');

function createHarness() {
  const get = vi.fn((key: string) =>
    key === 'LEONARDO_KEY' ? 'env-key' : undefined,
  );
  const configService = { get } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  return {
    configService,
    loggerService,
    service: new LeonardoAIService(configService, loggerService),
  };
}

describe('LeonardoAIService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.createGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'gen-1' } },
      status: 200,
    });
    sdk.createImageToVideoGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'vid-1' } },
    });
    sdk.createVideoGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'vid-2' } },
    });
    sdk.createReworkGeneration.mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'rework-1' } },
    });
    sdk.getGenerationById.mockResolvedValue({
      generations_by_pk: { generated_images: [{ id: 'img-42' }] },
    });
  });

  it('authenticates the SDK eagerly from configuration', () => {
    createHarness();

    expect(sdk.auth).toHaveBeenCalledWith('env-key');
  });

  describe('generateImage', () => {
    it('returns the generation id on a 200 response', async () => {
      const { service } = createHarness();

      await expect(service.generateImage('a cat')).resolves.toBe('gen-1');
    });

    it.each([
      [1024, 1024, 1024, 1024],
      [1080, 1920, 768, 1344],
      [1920, 1080, 1344, 768],
    ])(
      'maps the %sx%s request to %sx%s provider dimensions',
      async (width, height, expectedWidth, expectedHeight) => {
        const { service } = createHarness();

        await service.generateImage('a cat', {
          height,
          style: 'anime',
          width,
        });

        expect(sdk.createGeneration).toHaveBeenCalledWith(
          expect.objectContaining({
            height: expectedHeight,
            width: expectedWidth,
          }),
        );
      },
    );

    it('sends null dimensions for an unmapped size', async () => {
      const { service } = createHarness();

      await service.generateImage('a cat', {
        height: 111,
        style: 'anime',
        width: 999,
      });

      expect(sdk.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ height: null, width: null }),
      );
    });

    it('sends null dimensions when no options are supplied', async () => {
      const { service } = createHarness();

      await service.generateImage('a cat');

      expect(sdk.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          height: null,
          presetStyle: 'ANIME',
          num_images: 1,
          prompt: 'a cat',
          width: null,
        }),
      );
    });

    it('upper-cases the requested preset style', async () => {
      const { service } = createHarness();

      await service.generateImage('a cat', {
        height: 1024,
        style: 'cinematic',
        width: 1024,
      });

      expect(sdk.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ presetStyle: 'CINEMATIC' }),
      );
    });

    it('swaps in an override key and restores the env key afterwards', async () => {
      const { service } = createHarness();
      sdk.auth.mockClear();

      await service.generateImage('a cat', undefined, 'byok-key');

      expect(sdk.auth).toHaveBeenNthCalledWith(1, 'byok-key');
      expect(sdk.auth).toHaveBeenNthCalledWith(2, 'env-key');
    });

    it('restores the env key even when the provider call throws', async () => {
      const { service } = createHarness();
      sdk.createGeneration.mockRejectedValue(new Error('network down'));
      sdk.auth.mockClear();

      await service.generateImage('a cat', undefined, 'byok-key');

      expect(sdk.auth).toHaveBeenNthCalledWith(2, 'env-key');
    });

    it('logs and swallows a non-200 provider response', async () => {
      const { loggerService, service } = createHarness();
      sdk.createGeneration.mockResolvedValue({
        error: new Error('rate limited'),
        status: 429,
      });

      await expect(service.generateImage('a cat')).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('logs and swallows a transport error', async () => {
      const { loggerService, service } = createHarness();
      const networkError = new Error('network down');
      sdk.createGeneration.mockRejectedValue(networkError);

      await expect(service.generateImage('a cat')).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        networkError,
      );
    });
  });

  describe('generateImageToVideo', () => {
    it('uses an image id directly when it is already an img reference', async () => {
      const { service } = createHarness();

      await expect(
        service.generateImageToVideo('pan left', 'img-7'),
      ).resolves.toBe('vid-1');

      expect(sdk.getGenerationById).not.toHaveBeenCalled();
      expect(sdk.createImageToVideoGeneration).toHaveBeenCalledWith({
        imageId: 'img-7',
        imageType: 'GENERATED',
        prompt: 'pan left',
      });
    });

    it('resolves the first generated image for a generation id', async () => {
      const { service } = createHarness();

      await service.generateImageToVideo('pan left', 'gen-7');

      expect(sdk.getGenerationById).toHaveBeenCalledWith({ id: 'gen-7' });
      expect(sdk.createImageToVideoGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ imageId: 'img-42' }),
      );
    });

    it('logs and swallows a missing generation id', async () => {
      const { loggerService, service } = createHarness();

      await expect(
        service.generateImageToVideo('pan left'),
      ).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({ message: 'Generation ID is required' }),
      );
    });

    it('restores the env key after using an override key', async () => {
      const { service } = createHarness();
      sdk.auth.mockClear();

      await service.generateImageToVideo('pan left', 'img-7', 'byok-key');

      expect(sdk.auth).toHaveBeenNthCalledWith(1, 'byok-key');
      expect(sdk.auth).toHaveBeenNthCalledWith(2, 'env-key');
    });
  });

  describe('generateTextToVideo', () => {
    it('returns the generation id', async () => {
      const { service } = createHarness();

      await expect(service.generateTextToVideo('a sunset')).resolves.toBe(
        'vid-2',
      );
      expect(sdk.createVideoGeneration).toHaveBeenCalledWith({
        prompt: 'a sunset',
      });
    });

    it('restores the env key after using an override key', async () => {
      const { service } = createHarness();
      sdk.auth.mockClear();

      await service.generateTextToVideo('a sunset', 'byok-key');

      expect(sdk.auth).toHaveBeenNthCalledWith(1, 'byok-key');
      expect(sdk.auth).toHaveBeenNthCalledWith(2, 'env-key');
    });

    it('logs and swallows a transport error', async () => {
      const { loggerService, service } = createHarness();
      sdk.createVideoGeneration.mockRejectedValue(new Error('boom'));

      await expect(
        service.generateTextToVideo('a sunset'),
      ).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('reworkImage', () => {
    it('returns the generation id', async () => {
      const { service } = createHarness();

      await expect(service.reworkImage('brighter', 'img-3')).resolves.toBe(
        'rework-1',
      );
      expect(sdk.createReworkGeneration).toHaveBeenCalledWith({
        imageId: 'img-3',
        prompt: 'brighter',
      });
    });

    it('restores the env key after using an override key', async () => {
      const { service } = createHarness();
      sdk.auth.mockClear();

      await service.reworkImage('brighter', 'img-3', 'byok-key');

      expect(sdk.auth).toHaveBeenNthCalledWith(1, 'byok-key');
      expect(sdk.auth).toHaveBeenNthCalledWith(2, 'env-key');
    });

    it('logs and swallows a transport error', async () => {
      const { loggerService, service } = createHarness();
      sdk.createReworkGeneration.mockRejectedValue(new Error('boom'));

      await expect(
        service.reworkImage('brighter', 'img-3'),
      ).resolves.toBeUndefined();
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
