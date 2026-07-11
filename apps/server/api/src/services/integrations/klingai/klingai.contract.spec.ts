vi.mock('@server/helpers/utils/jwt/jwt.util', () => ({
  encodeJwtToken: vi.fn(() => 'jwt-token'),
}));

import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { KlingAIService } from '@server/services/integrations/klingai/services/klingai.service';
import { of, throwError } from 'rxjs';

/**
 * Contract tests for the KlingAI integration (image + video revenue path).
 *
 * These pin the outgoing request payloads for the three KlingAI v1 endpoints
 * and the `request_id` response parsing. `HttpService` is mocked; no network
 * calls are made. Fixtures cover success responses and provider failure shapes
 * (401 auth failure, non-200 status).
 *
 * To update when KlingAI changes its API: adjust the endpoint URLs, request
 * body assertions, and response fixtures below.
 */
describe('KlingAIService (contract)', () => {
  let service: KlingAIService;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  const CALLBACK_URL = 'https://webhook.test/v1/webhooks/klingai/callback';
  const INGREDIENTS = 'https://ingredients.test';

  const configMock = {
    get: vi.fn((key?: string) => {
      switch (key) {
        case 'GENFEEDAI_WEBHOOKS_URL':
          return 'https://webhook.test';
        case 'KLINGAI_KEY':
          return 'kling-key';
        case 'KLINGAI_SECRET':
          return 'kling-secret';
        case 'KLINGAI_MODEL':
          return 'kling-v2';
        // KLINGAI_WEBHOOK_SECRET intentionally unset → callback carries no token.
        default:
          return undefined;
      }
    }),
    ingredientsEndpoint: INGREDIENTS,
  } as unknown as ConfigService;

  beforeEach(async () => {
    httpService = {
      post: vi
        .fn()
        .mockReturnValue(
          of({ data: { request_id: 'kling-req-1' }, status: 200 }),
        ),
    };
    logger = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KlingAIService,
        { provide: ConfigService, useValue: configMock },
        { provide: LoggerService, useValue: logger },
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get<KlingAIService>(KlingAIService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('generateImage — /images/generations contract', () => {
    it('POSTs the image payload with a Bearer JWT and returns request_id', async () => {
      const id = await service.generateImage('a neon skyline', {
        height: 1024,
        model: 'kling-v2',
        reference: 'https://ref/image.png',
        style: 'cinematic',
        width: 1024,
      });

      expect(id).toBe('kling-req-1');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/images/generations',
        {
          aspect_ratio: '1:1',
          callback_url: CALLBACK_URL,
          image: 'https://ref/image.png',
          model: 'kling-v2',
          n: 1,
          prompt: 'a neon skyline',
        },
        {
          headers: {
            Authorization: 'Bearer jwt-token',
            'Content-Type': 'application/json',
          },
        },
      );
    });
  });

  describe('generateTextToVideo — /videos/text2video contract', () => {
    it('POSTs the text2video payload with duration and aspect ratio', async () => {
      const id = await service.generateTextToVideo('a rolling wave', {
        height: 1920,
        model: 'kling-v2',
        width: 1080,
      });

      expect(id).toBe('kling-req-1');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/text2video',
        {
          aspect_ratio: '9:16',
          callback_url: CALLBACK_URL,
          duration: 5,
          model: 'kling-v2',
          prompt: 'a rolling wave',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        }),
      );
    });
  });

  describe('generateImageToVideo — /videos/image2video contract', () => {
    it('POSTs the image2video payload referencing the ingredients image url', async () => {
      const id = await service.generateImageToVideo(
        'animate this',
        'parent-99',
      );

      expect(id).toBe('kling-req-1');
      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/image2video',
        {
          callback_url: CALLBACK_URL,
          duration: 5,
          image: `${INGREDIENTS}/images/parent-99`,
          model: 'kling-v2',
          prompt: 'animate this',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        }),
      );
    });
  });

  describe('failure modes', () => {
    it('throws "KlingAI authorization failed" on a 401 response', async () => {
      // Failure fixture: KlingAI 401 unauthorized.
      httpService.post.mockReturnValueOnce(
        throwError(() => ({ response: { data: {}, status: 401 } })),
      );

      await expect(service.generateImage('prompt')).rejects.toThrow(
        'KlingAI authorization failed',
      );
    });

    it('throws "KlingAI authorization failed" on a 403 response', async () => {
      httpService.post.mockReturnValueOnce(
        throwError(() => ({ response: { data: {}, status: 403 } })),
      );

      await expect(service.generateTextToVideo('prompt')).rejects.toThrow(
        'KlingAI authorization failed',
      );
    });

    it('rejects on a non-200 status (not 401/403) instead of swallowing it', async () => {
      // A generic non-200 (here 500) trips the in-try guard, which throws
      // `KlingAI API returned non-200 status`. The catch logs it and rethrows
      // rather than resolving `undefined`, so a hard provider failure can no
      // longer be mistaken for a successful-but-empty result (a missing
      // request_id) by an upstream caller on the revenue path.
      httpService.post.mockReturnValueOnce(
        of({ data: { error: 'server error' }, status: 500 }),
      );

      await expect(service.generateImage('prompt')).rejects.toThrow(
        'KlingAI API returned non-200 status',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('rejects on a transport error (no HTTP response) instead of swallowing it', async () => {
      // Network/transport failures carry no `response`, so they miss the
      // 401/403 branch. The catch logs and rethrows the original error rather
      // than resolving `undefined`.
      const transportError = new Error('socket hang up');
      httpService.post.mockReturnValueOnce(throwError(() => transportError));

      await expect(service.generateTextToVideo('prompt')).rejects.toThrow(
        'socket hang up',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
