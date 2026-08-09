import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { KlingAIService } from './klingai.service';

const CONFIG: Record<string, string> = {
  GENFEEDAI_WEBHOOKS_URL: 'https://hooks.test',
  KLINGAI_KEY: 'env-key',
  KLINGAI_MODEL: 'kling-v1',
  KLINGAI_SECRET: 'env-secret',
  KLINGAI_WEBHOOK_SECRET: 'hook-secret',
};

function createHarness(
  configOverrides: Record<string, string | undefined> = {},
) {
  const values = { ...CONFIG, ...configOverrides };
  const configService = {
    get: vi.fn((key: string) => values[key]),
    ingredientsEndpoint: 'https://ingredients.test',
  } as unknown as ConfigService;
  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const post = vi
    .fn()
    .mockReturnValue(of({ data: { request_id: 'req-1' }, status: 200 }));
  const httpService = { post } as unknown as HttpService;

  return {
    configService,
    httpService,
    loggerService,
    post,
    service: new KlingAIService(configService, loggerService, httpService),
  };
}

function axiosError(status: number) {
  return {
    response: { data: { message: 'nope' }, status, statusText: 'Error' },
  };
}

describe('KlingAIService', () => {
  describe('callback url', () => {
    it('appends the webhook token to the vendor callback url', async () => {
      const { post, service } = createHarness();

      await service.generateImage('a cat');

      expect(post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/images/generations',
        expect.objectContaining({
          callback_url:
            'https://hooks.test/v1/webhooks/klingai/callback?token=hook-secret',
        }),
        expect.anything(),
      );
    });

    it('leaves the callback url un-tokenised when no secret is configured', async () => {
      const { post, service } = createHarness({
        KLINGAI_WEBHOOK_SECRET: undefined,
      });

      await service.generateImage('a cat');

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          callback_url: 'https://hooks.test/v1/webhooks/klingai/callback',
        }),
        expect.anything(),
      );
    });

    it('tolerates a missing webhooks base url', async () => {
      const { post, service } = createHarness({
        GENFEEDAI_WEBHOOKS_URL: undefined,
      });

      await service.generateImage('a cat');

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          callback_url: '/v1/webhooks/klingai/callback?token=hook-secret',
        }),
        expect.anything(),
      );
    });
  });

  describe('generateImage', () => {
    it('returns the provider request id', async () => {
      const { service } = createHarness();

      await expect(service.generateImage('a cat')).resolves.toBe('req-1');
    });

    it.each([
      [1024, 1024, '1:1'],
      [1080, 1920, '9:16'],
      [1920, 1080, '16:9'],
      [640, 480, '9:16'],
    ])(
      'maps %sx%s to the %s aspect ratio',
      async (width, height, aspectRatio) => {
        const { post, service } = createHarness();

        await service.generateImage('a cat', {
          height,
          model: 'kling-v2',
          style: 'anime',
          width,
        });

        expect(post).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ aspect_ratio: aspectRatio }),
          expect.anything(),
        );
      },
    );

    it('defaults to a 9:16 ratio and the configured model', async () => {
      const { post, service } = createHarness();

      await service.generateImage('a cat');

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          aspect_ratio: '9:16',
          model: 'kling-v1',
          n: 1,
          prompt: 'a cat',
        }),
        expect.anything(),
      );
    });

    it('signs requests with a bearer token derived from the env credentials', async () => {
      const { post, service } = createHarness();

      await service.generateImage('a cat');

      const headers = post.mock.calls[0][2] as {
        headers: Record<string, string>;
      };
      expect(headers.headers.Authorization).toMatch(/^Bearer ey/);
      expect(headers.headers['Content-Type']).toBe('application/json');
    });

    it('signs requests with an overridden BYOK credential pair', async () => {
      const { post, service } = createHarness();

      await service.generateImage('a cat', undefined, {
        apiKey: 'byok-key',
        apiSecret: 'byok-secret',
      });
      await service.generateImage('a cat');

      const first = post.mock.calls[0][2] as {
        headers: Record<string, string>;
      };
      const second = post.mock.calls[1][2] as {
        headers: Record<string, string>;
      };
      expect(first.headers.Authorization).not.toBe(
        second.headers.Authorization,
      );
    });

    it('throws on a non-200 provider status', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {}, status: 500 }));

      await expect(service.generateImage('a cat')).rejects.toThrowError(
        'KlingAI API returned non-200 status',
      );
    });

    it.each([[401], [403]])(
      'raises an authorization failure for a %s response',
      async (status) => {
        const { loggerService, post, service } = createHarness();
        post.mockReturnValue(throwError(() => axiosError(status)));

        await expect(service.generateImage('a cat')).rejects.toThrowError(
          'KlingAI authorization failed',
        );
        expect(loggerService.error).toHaveBeenCalledWith(
          expect.stringContaining('unauthorized'),
          expect.objectContaining({ status }),
        );
      },
    );

    it('logs and rethrows a transport error', async () => {
      const { loggerService, post, service } = createHarness();
      const transportError = new Error('socket hang up');
      post.mockReturnValue(throwError(() => transportError));

      await expect(service.generateImage('a cat')).rejects.toThrowError(
        transportError,
      );
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Object),
      );
    });
  });

  describe('generateImageToVideo', () => {
    it('resolves the parent image through the ingredients endpoint', async () => {
      const { post, service } = createHarness();

      await expect(
        service.generateImageToVideo('pan left', 'ingredient-1'),
      ).resolves.toBe('req-1');

      expect(post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/image2video',
        expect.objectContaining({
          duration: 5,
          image: 'https://ingredients.test/images/ingredient-1',
          model: 'kling-v1',
          prompt: 'pan left',
        }),
        expect.anything(),
      );
    });

    it('honours an explicit model override', async () => {
      const { post, service } = createHarness();

      await service.generateImageToVideo('pan left', 'ingredient-1', {
        model: 'kling-v2',
      });

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ model: 'kling-v2' }),
        expect.anything(),
      );
    });

    it('throws on a non-200 provider status', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {}, status: 502 }));

      await expect(
        service.generateImageToVideo('pan left', 'ingredient-1'),
      ).rejects.toThrowError('KlingAI API returned non-200 status');
    });

    it('raises an authorization failure for a 401 response', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(throwError(() => axiosError(401)));

      await expect(
        service.generateImageToVideo('pan left', 'ingredient-1'),
      ).rejects.toThrowError('KlingAI authorization failed');
    });

    it('logs and rethrows a transport error', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('socket hang up')));

      await expect(
        service.generateImageToVideo('pan left', 'ingredient-1'),
      ).rejects.toThrowError('socket hang up');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('generateTextToVideo', () => {
    it('posts to the text2video endpoint with a 5 second duration', async () => {
      const { post, service } = createHarness();

      await expect(service.generateTextToVideo('a sunset')).resolves.toBe(
        'req-1',
      );
      expect(post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/text2video',
        expect.objectContaining({
          aspect_ratio: '9:16',
          duration: 5,
          prompt: 'a sunset',
        }),
        expect.anything(),
      );
    });

    it('maps explicit dimensions onto the aspect ratio', async () => {
      const { post, service } = createHarness();

      await service.generateTextToVideo('a sunset', {
        height: 1080,
        model: 'kling-v2',
        width: 1920,
      });

      expect(post).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ aspect_ratio: '16:9', model: 'kling-v2' }),
        expect.anything(),
      );
    });

    it('throws on a non-200 provider status', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(of({ data: {}, status: 500 }));

      await expect(
        service.generateTextToVideo('a sunset'),
      ).rejects.toThrowError('KlingAI API returned non-200 status');
    });

    it('raises an authorization failure for a 403 response', async () => {
      const { post, service } = createHarness();
      post.mockReturnValue(throwError(() => axiosError(403)));

      await expect(
        service.generateTextToVideo('a sunset'),
      ).rejects.toThrowError('KlingAI authorization failed');
    });

    it('logs and rethrows a transport error', async () => {
      const { loggerService, post, service } = createHarness();
      post.mockReturnValue(throwError(() => new Error('socket hang up')));

      await expect(
        service.generateTextToVideo('a sunset'),
      ).rejects.toThrowError('socket hang up');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('queue wrappers', () => {
    it('runs queued image generation through the concurrency limiter', async () => {
      const { post, service } = createHarness();

      await expect(service.queueGenerateImage('a cat')).resolves.toBe('req-1');
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('runs queued image-to-video generation through the limiter', async () => {
      const { post, service } = createHarness();

      await expect(
        service.queueGenerateImageToVideo('pan left', 'ingredient-1'),
      ).resolves.toBe('req-1');
      expect(post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/image2video',
        expect.anything(),
        expect.anything(),
      );
    });

    it('runs queued text-to-video generation through the limiter', async () => {
      const { post, service } = createHarness();

      await expect(service.queueGenerateTextToVideo('a sunset')).resolves.toBe(
        'req-1',
      );
      expect(post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/text2video',
        expect.anything(),
        expect.anything(),
      );
    });

    it('serialises more than three concurrent queued calls', async () => {
      const { post, service } = createHarness();

      await Promise.all([
        service.queueGenerateImage('a'),
        service.queueGenerateImage('b'),
        service.queueGenerateImage('c'),
        service.queueGenerateImage('d'),
      ]);

      expect(post).toHaveBeenCalledTimes(4);
    });
  });
});
