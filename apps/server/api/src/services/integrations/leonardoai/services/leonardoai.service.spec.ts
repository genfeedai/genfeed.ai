import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

function createSdk() {
  let apiKey: unknown;
  return {
    auth: vi.fn((key: unknown) => {
      apiKey = key;
    }),
    createGeneration: vi.fn().mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'gen-1' } },
      status: 200,
    }),
    createImageToVideoGeneration: vi.fn().mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'vid-1' } },
    }),
    createReworkGeneration: vi.fn().mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'rework-1' } },
    }),
    createVideoGeneration: vi.fn().mockResolvedValue({
      data: { sdGenerationJob: { generationId: 'vid-2' } },
    }),
    currentAuth: () => apiKey,
    getGenerationById: vi.fn().mockResolvedValue({
      generations_by_pk: { generated_images: [{ id: 'img-42' }] },
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const sdk = createSdk();
const queuedSdks: ReturnType<typeof createSdk>[] = [];
const sdkInstances: ReturnType<typeof createSdk>[] = [];

vi.mock('api', () => ({
  default: vi.fn(() => {
    const client =
      sdkInstances.length === 0 ? sdk : (queuedSdks.shift() ?? createSdk());
    sdkInstances.push(client);
    return client;
  }),
}));

const { LeonardoAIService } = await import('./leonardoai.service');

function createHarness(
  configuredKeys = new Map([['LEONARDO_KEY', 'env-key']]),
) {
  const get = vi.fn((key: string) => configuredKeys.get(key));
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
    queuedSdks.length = 0;
    sdkInstances.length = 0;
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

  it('preserves absent default authentication while allowing an override', async () => {
    const { loggerService, service } = createHarness(new Map<string, string>());
    const error = new Error('missing authentication');
    sdk.createGeneration.mockRejectedValueOnce(error);
    await expect(service.generateImage('managed')).resolves.toBeUndefined();
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('failed'),
      error,
    );
    const overrideSdk = createSdk();
    queuedSdks.push(overrideSdk);

    await expect(
      service.generateImage('a cat', undefined, 'byok-key'),
    ).resolves.toBe('gen-1');

    expect(sdk.auth).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
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

    it('uses an override client without changing later managed generation', async () => {
      const { service } = createHarness();
      const overrideSdk = createSdk();
      queuedSdks.push(overrideSdk);

      await expect(
        service.generateImage('a cat', undefined, 'byok-key'),
      ).resolves.toBe('gen-1');
      await expect(service.generateImage('managed')).resolves.toBe('gen-1');

      expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
      expect(overrideSdk.createGeneration).toHaveBeenCalledTimes(1);
      expect(sdk.createGeneration).toHaveBeenCalledTimes(1);
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
    });

    it('does not change default credentials when an override call fails', async () => {
      const { loggerService, service } = createHarness();
      const overrideSdk = createSdk();
      queuedSdks.push(overrideSdk);
      const error = new Error('network down');
      overrideSdk.createGeneration.mockRejectedValue(error);

      await expect(
        service.generateImage('a cat', undefined, 'byok-key'),
      ).resolves.toBeUndefined();
      await expect(service.generateImage('managed')).resolves.toBe('gen-1');

      expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        error,
      );
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

    it('uses a request-local override without changing default credentials', async () => {
      const { service } = createHarness();
      const overrideSdk = createSdk();
      queuedSdks.push(overrideSdk);

      await service.generateImageToVideo('pan left', 'img-7', 'byok-key');

      expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
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

    it('uses a request-local override without changing default credentials', async () => {
      const { service } = createHarness();
      const overrideSdk = createSdk();
      queuedSdks.push(overrideSdk);

      await service.generateTextToVideo('a sunset', 'byok-key');

      expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
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

    it('uses a request-local override without changing default credentials', async () => {
      const { service } = createHarness();
      const overrideSdk = createSdk();
      queuedSdks.push(overrideSdk);

      await service.reworkImage('brighter', 'img-3', 'byok-key');

      expect(overrideSdk.auth).toHaveBeenCalledExactlyOnceWith('byok-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
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

  describe('concurrent request credentials', () => {
    it('keeps managed generation on the default key while a BYOK call is pending', async () => {
      const { service } = createHarness();
      const byokSdk = createSdk();
      queuedSdks.push(byokSdk);
      const response = {
        data: { sdGenerationJob: { generationId: 'gen-overlap' } },
        status: 200,
      };
      const pending = deferred<typeof response>();
      const usedKeys = new Map<string, unknown>();
      for (const client of [sdk, byokSdk]) {
        client.createGeneration.mockImplementation(
          (input: Record<string, unknown>) => {
            usedKeys.set(String(input.prompt), client.currentAuth());
            return input.prompt === 'byok'
              ? pending.promise
              : Promise.resolve(response);
          },
        );
      }

      const byok = service.generateImage('byok', undefined, 'org-a-key');
      await expect(service.generateImage('managed')).resolves.toBe(
        'gen-overlap',
      );
      pending.resolve(response);
      await expect(byok).resolves.toBe('gen-overlap');

      expect(usedKeys.get('byok')).toBe('org-a-key');
      expect(usedKeys.get('managed')).toBe('env-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
      expect(byokSdk.auth).toHaveBeenCalledExactlyOnceWith('org-a-key');
    });

    it('isolates two overlapping BYOK clients through reverse completion', async () => {
      const { service } = createHarness();
      const firstSdk = createSdk();
      const secondSdk = createSdk();
      queuedSdks.push(firstSdk, secondSdk);
      const response = {
        data: { sdGenerationJob: { generationId: 'gen-overlap' } },
        status: 200,
      };
      const firstPending = deferred<typeof response>();
      const secondPending = deferred<typeof response>();
      const usedKeys = new Map<string, unknown>();
      for (const client of [sdk, firstSdk, secondSdk]) {
        client.createGeneration.mockImplementation(
          async (input: Record<string, unknown>) => {
            const result = await (input.prompt === 'first'
              ? firstPending.promise
              : secondPending.promise);
            usedKeys.set(String(input.prompt), client.currentAuth());
            return result;
          },
        );
      }

      const first = service.generateImage('first', undefined, 'org-a-key');
      const second = service.generateImage('second', undefined, 'org-b-key');
      secondPending.resolve(response);
      await expect(second).resolves.toBe('gen-overlap');
      firstPending.resolve(response);
      await expect(first).resolves.toBe('gen-overlap');

      expect(usedKeys.get('first')).toBe('org-a-key');
      expect(usedKeys.get('second')).toBe('org-b-key');
      expect(sdkInstances).toEqual([sdk, firstSdk, secondSdk]);
      expect(firstSdk.auth).toHaveBeenCalledExactlyOnceWith('org-a-key');
      expect(secondSdk.auth).toHaveBeenCalledExactlyOnceWith('org-b-key');
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
    });

    it('keeps the lookup client for image-to-video after another BYOK call finishes', async () => {
      const { service } = createHarness();
      const videoSdk = createSdk();
      const imageSdk = createSdk();
      queuedSdks.push(videoSdk, imageSdk);
      const lookup = deferred<{
        generations_by_pk: { generated_images: { id: string }[] };
      }>();
      const followupKeys: unknown[] = [];
      for (const client of [sdk, videoSdk]) {
        client.getGenerationById.mockReturnValue(lookup.promise);
        client.createImageToVideoGeneration.mockImplementation(() => {
          followupKeys.push(client.currentAuth());
          return Promise.resolve({
            data: { sdGenerationJob: { generationId: 'vid-overlap' } },
          });
        });
      }

      const video = service.generateImageToVideo('pan', 'gen-7', 'org-a-key');
      await expect(
        service.generateImage('second', undefined, 'org-b-key'),
      ).resolves.toBe('gen-1');
      lookup.resolve({
        generations_by_pk: { generated_images: [{ id: 'img-42' }] },
      });
      await expect(video).resolves.toBe('vid-overlap');

      expect(followupKeys).toEqual(['org-a-key']);
      expect(videoSdk.getGenerationById).toHaveBeenCalledWith({ id: 'gen-7' });
      expect(videoSdk.createImageToVideoGeneration).toHaveBeenCalledWith({
        imageId: 'img-42',
        imageType: 'GENERATED',
        prompt: 'pan',
      });
      expect(sdk.auth).toHaveBeenCalledExactlyOnceWith('env-key');
    });
  });
});
