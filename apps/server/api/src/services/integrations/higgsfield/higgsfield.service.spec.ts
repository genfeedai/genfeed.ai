import { SERVER_TOKENS } from '@api/server.dependencies';
import { HiggsFieldProviderError } from '@api/services/integrations/higgsfield/errors/higgsfield-provider.error';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { AgentFailureReason } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

const PLATFORM = 'https://api.higgsfield.ai';

describe('HiggsFieldService', () => {
  let service: HiggsFieldService;
  let mockHttpService: Record<string, ReturnType<typeof vi.fn>>;
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;
  let mockByokService: Record<string, ReturnType<typeof vi.fn>>;
  let mockPollUntilService: { poll: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockByokService = {
      resolveApiKey: vi.fn().mockResolvedValue(undefined),
    };

    mockPollUntilService = {
      poll: vi.fn(),
    };

    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'HIGGSFIELD_API_KEY') return 'test-key';
        if (key === 'HIGGSFIELD_API_SECRET') return 'test-secret';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HiggsFieldService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: HttpService, useValue: mockHttpService },
        { provide: SERVER_TOKENS.byok, useValue: mockByokService },
        { provide: PollUntilService, useValue: mockPollUntilService },
      ],
    }).compile();

    service = module.get<HiggsFieldService>(HiggsFieldService);
  });

  describe('generateImageToVideo', () => {
    it('posts the DoP endpoint with the variant the model key names', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-abc', status: 'queued' }, status: 200 }),
      );

      const result = await service.generateImageToVideo({
        imageUrl: 'https://example.com/img.png',
        modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
        prompt: 'Test prompt',
      });

      expect(result.requestId).toBe('req-abc');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_DOP_TURBO}`,
        {
          image_url: 'https://example.com/img.png',
          prompt: 'Test prompt',
        },
        {
          headers: {
            Authorization: 'Key test-key:test-secret',
            'Content-Type': 'application/json',
          },
        },
      );
    });

    it('rejects a model key that is not a DoP tier', async () => {
      await expect(
        service.generateImageToVideo({
          imageUrl: 'https://example.com/img.png',
          modelKey: MODEL_KEYS.HIGGSFIELD_SOUL,
          prompt: 'Test prompt',
        }),
      ).rejects.toThrow('Unknown Higgsfield video model');

      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('maps a 401 onto a typed authentication failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      await expect(
        service.generateImageToVideo({
          imageUrl: 'https://example.com/img.png',
          modelKey: MODEL_KEYS.HIGGSFIELD_DOP_LITE,
          prompt: 'Test prompt',
        }),
      ).rejects.toMatchObject({
        isRetryable: false,
        reason: AgentFailureReason.PROVIDER_AUTHENTICATION,
      });
    });

    it('maps a 403 onto an insufficient-credit failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => ({ response: { status: 403 } })),
      );

      await expect(
        service.generateImageToVideo({
          imageUrl: 'https://example.com/img.png',
          modelKey: MODEL_KEYS.HIGGSFIELD_DOP_LITE,
          prompt: 'Test prompt',
        }),
      ).rejects.toMatchObject({
        reason: AgentFailureReason.INSUFFICIENT_CREDITS,
      });
    });

    it('uses BYOK credentials when the organization has them', async () => {
      mockByokService.resolveApiKey.mockResolvedValue({
        apiKey: 'org-key',
        apiSecret: 'org-secret',
      });
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-byok', status: 'queued' }, status: 200 }),
      );

      await service.generateImageToVideo({
        imageUrl: 'https://example.com/img.png',
        modelKey: MODEL_KEYS.HIGGSFIELD_DOP_STANDARD,
        organizationId: 'org-1',
        prompt: 'Test prompt',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        {
          headers: expect.objectContaining({
            Authorization: 'Key org-key:org-secret',
          }),
        },
      );
    });

    it('passes a webhook as the hf_webhook query parameter', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-hook', status: 'queued' }, status: 200 }),
      );

      await service.generateImageToVideo({
        imageUrl: 'https://example.com/img.png',
        modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
        prompt: 'Test prompt',
        webhook: { url: 'https://app.test/hook' },
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_DOP_TURBO}?hf_webhook=${encodeURIComponent('https://app.test/hook')}`,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('generateTextToImage', () => {
    it('posts Soul 2 with a documented aspect_ratio and resolution', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        aspectRatio: '9:16',
        prompt: 'A portrait',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_SOUL}`,
        {
          aspect_ratio: '9:16',
          batch_size: 1,
          prompt: 'A portrait',
          resolution: '1080p',
        },
        expect.any(Object),
      );
    });

    it('falls back to 4:3 for a ratio Soul does not document', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        aspectRatio: '21:9',
        prompt: 'A panorama',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ aspect_ratio: '4:3' }),
        expect.any(Object),
      );
    });

    it('rounds any multi-image request up to Soul’s batch of four', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({ batchSize: 2, prompt: 'A set' });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ batch_size: 4 }),
        expect.any(Object),
      );
    });
  });

  describe('credentials', () => {
    it('fails closed when neither platform credentials nor BYOK are configured', async () => {
      const bare: TestingModule = await Test.createTestingModule({
        providers: [
          HiggsFieldService,
          { provide: ConfigService, useValue: { get: vi.fn(() => undefined) } },
          { provide: LoggerService, useValue: mockLogger },
          { provide: HttpService, useValue: mockHttpService },
          { provide: SERVER_TOKENS.byok, useValue: mockByokService },
          { provide: PollUntilService, useValue: mockPollUntilService },
        ],
      }).compile();

      const started = vi.fn();
      await expect(
        bare.get(HiggsFieldService).generateImageToVideo({
          modelKey: MODEL_KEYS.HIGGSFIELD_DOP_TURBO,
          imageUrl: 'https://cdn.test/image.png',
          prompt: 'x',
          onProviderSubmissionStarted: started,
        }),
      ).rejects.toMatchObject({
        reason: AgentFailureReason.PROVIDER_CONFIGURATION,
      });

      expect(started).not.toHaveBeenCalled();
      // Never send `Authorization: Key :` and let the platform 401 instead.
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('rejects a BYOK credential that carries no secret', async () => {
      mockByokService.resolveApiKey.mockResolvedValue({ apiKey: 'org-key' });

      await expect(
        service.generateTextToImage({ organizationId: 'org-1', prompt: 'x' }),
      ).rejects.toMatchObject({
        reason: AgentFailureReason.PROVIDER_CONFIGURATION,
      });
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('getRequestStatus', () => {
    it('reads the documented status path', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            images: [{ url: 'https://example.com/out.png' }],
            request_id: 'req-1',
            status: 'completed',
          },
        }),
      );

      const status = await service.getRequestStatus('req-1', {
        apiKey: 'k',
        apiSecret: 's',
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        `${PLATFORM}/requests/req-1/status`,
        expect.any(Object),
      );
      expect(status.status).toBe('completed');
    });

    it('keeps the poll alive on a server error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 503 } })),
      );

      const status = await service.getRequestStatus('req-1', {
        apiKey: 'k',
        apiSecret: 's',
      });

      expect(status).toEqual({ request_id: 'req-1', status: 'queued' });
    });

    it('renders an unmapped status with its code and detail, never [object Object]', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: { data: { detail: 'model blocked' }, status: 423 },
        })),
      );

      await expect(
        service.getRequestStatus('req-1', { apiKey: 'k', apiSecret: 's' }),
      ).rejects.toThrow('Higgsfield returned HTTP 423: model blocked.');
    });

    it('surfaces a client error instead of masking it as queued', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 401 } })),
      );

      await expect(
        service.getRequestStatus('req-1', { apiKey: 'k', apiSecret: 's' }),
      ).rejects.toBeInstanceOf(HiggsFieldProviderError);
    });

    it('fails fast on an unknown request id rather than polling to timeout', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 404 } })),
      );

      await expect(
        service.getRequestStatus('req-gone', { apiKey: 'k', apiSecret: 's' }),
      ).rejects.toMatchObject({
        isRetryable: false,
        reason: AgentFailureReason.ACTION_NOT_ALLOWED,
        statusCode: 404,
      });
    });
  });

  describe('readVideoRequest', () => {
    const statusResponse = (data: Record<string, unknown>) =>
      mockHttpService.get.mockReturnValue(
        of({ data: { request_id: 'req-1', ...data } }),
      );

    it.each(['queued', 'in_progress'])(
      'reports %s as pending',
      async (status) => {
        statusResponse({ status });

        expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
          state: 'pending',
        });
      },
    );

    it('keeps an accepted video pending through a rate limit and reads its result', async () => {
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => ({ response: { status: 429 } })),
      );
      statusResponse({
        status: 'completed',
        video: { url: 'https://cdn.test/out.mp4' },
      });

      expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
        state: 'pending',
      });
      expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
        state: 'completed',
        videoUrl: 'https://cdn.test/out.mp4',
      });
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('returns the video of a completed request', async () => {
      statusResponse({
        status: 'completed',
        video: { url: 'https://cdn.test/out.mp4' },
      });

      expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
        state: 'completed',
        videoUrl: 'https://cdn.test/out.mp4',
      });
    });

    it.each([
      ['completed', 'Higgsfield job req-1 completed without a video.'],
      ['failed', 'Higgsfield job req-1 failed.'],
      ['canceled', 'Higgsfield job req-1 was canceled.'],
      ['nsfw', 'Higgsfield job req-1 was rejected by the safety filter.'],
    ])(
      'reports a %s request as failed with its reason',
      async (status, reason) => {
        statusResponse({ status });

        expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
          reason,
          state: 'failed',
        });
      },
    );

    it('keeps a request pending when the status read hits a server error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ response: { status: 503 } })),
      );

      expect(await service.readVideoRequest('req-1', 'org-1')).toEqual({
        state: 'pending',
      });
    });
  });

  describe('generateMotionTransfer', () => {
    it('posts Genjutsu with the source clip, character stills, and an idempotency key', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-gen', status: 'queued' }, status: 200 }),
      );

      const result = await service.generateMotionTransfer({
        imageUrls: [
          'https://cdn.test/face.png',
          ' https://cdn.test/face.png ',
          'http://cdn.test/insecure.png',
        ],
        prompt: 'keep the walk',
        resolution: '1080p',
        videoUrl: 'https://cdn.test/walk.mp4',
      });

      expect(result.requestId).toBe('req-gen');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_GENJUTSU}`,
        {
          image_urls: ['https://cdn.test/face.png'],
          prompt: 'keep the walk',
          resolution: '1080p',
          video_url: 'https://cdn.test/walk.mp4',
        },
        {
          headers: expect.objectContaining({
            Authorization: 'Key test-key:test-secret',
            'Content-Type': 'application/json',
            'Idempotency-Key': expect.any(String),
          }),
        },
      );
    });

    it('uses caller key and returns actual status under the resolved binding', async () => {
      const binding = await service.getCredentialFingerprint('org');
      mockHttpService.post.mockReturnValue(
        of({
          data: {
            request_id: 'stable',
            status: 'completed',
            video: { url: 'https://fixture.invalid/output' },
          },
        }),
      );
      const result = await service.generateMotionTransfer({
        organizationId: 'org',
        expectedCredentialFingerprint: binding,
        idempotencyKey: 'durable-key',
        imageUrls: ['https://fixture.invalid/image'],
        videoUrl: 'https://fixture.invalid/video',
      });
      expect(result.status).toBe('completed');
      expect(
        mockHttpService.post.mock.calls[0][2].headers['Idempotency-Key'],
      ).toBe('durable-key');
    });
    it('blocks changed credential before submit and bound status transport', async () => {
      const binding = await service.getCredentialFingerprint('org');
      mockByokService.resolveApiKey.mockResolvedValue({
        apiKey: 'changed-key',
        apiSecret: 'secret',
      });
      await expect(
        service.generateMotionTransfer({
          organizationId: 'org',
          expectedCredentialFingerprint: binding,
          idempotencyKey: 'same',
          imageUrls: ['https://fixture.invalid/image'],
          videoUrl: 'https://fixture.invalid/video',
        }),
      ).rejects.toThrow('CHARACTER_REPLACEMENT_CREDENTIALS_CHANGED');
      await expect(
        service.getBoundRequestStatus('accepted', 'org', binding),
      ).rejects.toThrow('CHARACTER_REPLACEMENT_CREDENTIALS_CHANGED');
      expect(mockHttpService.post).not.toHaveBeenCalled();
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });
    it('reads bound status with one credential resolution and matching account', async () => {
      const binding = await service.getCredentialFingerprint('org');
      mockByokService.resolveApiKey.mockClear();
      mockHttpService.get.mockReturnValue(
        of({ data: { request_id: 'accepted', status: 'in_progress' } }),
      );
      expect(
        (await service.getBoundRequestStatus('accepted', 'org', binding))
          .status,
      ).toBe('in_progress');
      expect(mockByokService.resolveApiKey).toHaveBeenCalledTimes(1);
      expect(mockHttpService.get.mock.calls[0][1].headers.Authorization).toBe(
        'Key test-key:test-secret',
      );
    });

    it('rejects a clip that is not https before calling Higgsfield', async () => {
      await expect(
        service.generateMotionTransfer({
          imageUrls: ['https://cdn.test/face.png'],
          videoUrl: 'http://cdn.test/walk.mp4',
        }),
      ).rejects.toThrow('https source video URL');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('Soul Standard and Soul Cinema', () => {
    it.each([
      MODEL_KEYS.HIGGSFIELD_SOUL_STANDARD,
      MODEL_KEYS.HIGGSFIELD_SOUL_CINEMA,
    ])('posts %s at the documented 720p default', async (modelKey) => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        modelKey,
        prompt: 'A portrait',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${modelKey}`,
        {
          aspect_ratio: '4:3',
          batch_size: 1,
          prompt: 'A portrait',
          resolution: '720p',
        },
        expect.any(Object),
      );
    });

    it('falls back to Soul 2 for a key that is not a Soul endpoint', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        modelKey: 'some/other-model',
        prompt: 'A portrait',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_SOUL}`,
        expect.objectContaining({ resolution: '1080p' }),
        expect.any(Object),
      );
    });
  });

  describe('generateObjectSwap', () => {
    it('posts the object swap endpoint with the clip and reference stills', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-swap', status: 'queued' }, status: 200 }),
      );

      const result = await service.generateObjectSwap({
        imageUrls: ['https://cdn.test/mug.png'],
        videoUrl: 'https://cdn.test/desk.mp4',
      });

      expect(result).toEqual({
        requestId: 'req-swap',
        status: 'queued',
        videoUrl: undefined,
      });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_GENJUTSU_OBJECT_SWAP}`,
        {
          image_urls: ['https://cdn.test/mug.png'],
          prompt: '',
          resolution: '720p',
          video_url: 'https://cdn.test/desk.mp4',
        },
        expect.any(Object),
      );
    });

    it('rejects a request with no reference still', async () => {
      await expect(
        service.generateObjectSwap({
          imageUrls: [],
          videoUrl: 'https://cdn.test/desk.mp4',
        }),
      ).rejects.toThrow('1 to 8 https character image URLs');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('generateRestyle', () => {
    const presetId = 'c2143317-f28d-4c3c-a0b8-39bd547e08a7';

    it('posts the restyle endpoint with the preset and no character stills', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: { request_id: 'req-style', status: 'queued' },
          status: 200,
        }),
      );

      const result = await service.generateRestyle({
        presetId,
        resolution: '480p',
        videoUrl: 'https://cdn.test/walk.mp4',
      });

      expect(result.requestId).toBe('req-style');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_GENJUTSU_RESTYLE}`,
        {
          image_urls: [],
          preset_id: presetId,
          prompt: '',
          resolution: '480p',
          video_url: 'https://cdn.test/walk.mp4',
        },
        expect.any(Object),
      );
    });

    it('rejects a preset that is not a UUID instead of guessing a style', async () => {
      await expect(
        service.generateRestyle({
          presetId: 'cel-shaded-anime',
          videoUrl: 'https://cdn.test/walk.mp4',
        }),
      ).rejects.toThrow('style preset id');
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('rejects more than five character stills', async () => {
      await expect(
        service.generateRestyle({
          imageUrls: Array.from(
            { length: 6 },
            (_, index) => `https://cdn.test/face-${index}.png`,
          ),
          presetId,
          videoUrl: 'https://cdn.test/walk.mp4',
        }),
      ).rejects.toThrow('at most 5 https character image URLs');
    });
  });

  describe('listRestylePresets', () => {
    it('returns the catalog items from the documented path', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            items: [
              { id: 'c2143317-f28d-4c3c-a0b8-39bd547e08a7', name: 'Cel' },
            ],
            model: 'higgsfield/genjutsu/restyle/v1.0',
          },
          status: 200,
        }),
      );

      const presets = await service.listRestylePresets();

      expect(presets).toEqual([
        { id: 'c2143317-f28d-4c3c-a0b8-39bd547e08a7', name: 'Cel' },
      ]);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        `${PLATFORM}/models/higgsfield/genjutsu/restyle/v1.0/presets`,
        expect.any(Object),
      );
    });
  });

  describe('generateAdsStudioImages', () => {
    const okResponse = () =>
      of({ data: { request_id: 'req-ads', status: 'queued' }, status: 200 });

    it('posts the brief with documented defaults and an idempotency key', async () => {
      mockHttpService.post.mockReturnValue(okResponse());

      const result = await service.generateAdsStudioImages({
        prompt: '  Ad for Quiet Evening tea  ',
      });

      expect(result).toEqual({ imageUrls: [], requestId: 'req-ads' });
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_ADS_STUDIO}`,
        {
          aspect_ratio: '1:1',
          batch_size: 1,
          prompt: 'Ad for Quiet Evening tea',
        },
        {
          headers: expect.objectContaining({
            'Idempotency-Key': expect.any(String),
          }),
        },
      );
    });

    it('sends audience, niche, language and references when given', async () => {
      mockHttpService.post.mockReturnValue(okResponse());

      await service.generateAdsStudioImages({
        aspectRatio: '9:16',
        batchSize: 2,
        imageUrls: ['https://cdn.test/tin.png'],
        language: 'en',
        niche: 'Herbal tea',
        prompt: 'Two ads',
        targetAudience: 'Busy professionals',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        {
          aspect_ratio: '9:16',
          batch_size: 2,
          image_urls: ['https://cdn.test/tin.png'],
          language: 'en',
          niche: 'Herbal tea',
          prompt: 'Two ads',
          target_audience: 'Busy professionals',
        },
        expect.any(Object),
      );
    });

    it.each([
      { batchSize: 0, message: 'batch size' },
      { batchSize: 9, message: 'batch size' },
      { aspectRatio: 'auto', message: 'aspect ratio' },
      { prompt: '   ', message: 'brief of 1 to 8000 characters' },
    ])('rejects an invalid request ($message)', async (overrides) => {
      await expect(
        service.generateAdsStudioImages({ prompt: 'An ad', ...overrides }),
      ).rejects.toThrow(overrides.message);
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('generateCinemaStudioVideo', () => {
    const okResponse = () =>
      of({ data: { request_id: 'req-cinema', status: 'queued' }, status: 200 });

    it('posts text-to-video with documented defaults and an idempotency key', async () => {
      mockHttpService.post.mockReturnValue(okResponse());

      const result = await service.generateCinemaStudioVideo({
        prompt: ' a slow dolly through a rainy neon street ',
      });

      expect(result.requestId).toBe('req-cinema');
      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/${MODEL_KEYS.HIGGSFIELD_CINEMA_STUDIO}`,
        {
          aspect_ratio: '16:9',
          duration: 5,
          generate_audio: true,
          prompt: 'a slow dolly through a rainy neon street',
          resolution: '720p',
        },
        {
          headers: expect.objectContaining({
            Authorization: 'Key test-key:test-secret',
            'Idempotency-Key': expect.any(String),
          }),
        },
      );
    });

    it('sends reference media as image_urls, video_urls and audio_urls', async () => {
      mockHttpService.post.mockReturnValue(okResponse());

      await service.generateCinemaStudioVideo({
        aspectRatio: '21:9',
        audioUrls: ['https://cdn.test/score.mp3'],
        duration: 12,
        generateAudio: false,
        imageUrls: ['https://cdn.test/a.png', ' https://cdn.test/a.png '],
        prompt: 'match <<<image_1>>>',
        resolution: '480p',
        videoUrls: ['https://cdn.test/ref.mp4'],
      });

      expect(mockHttpService.post.mock.calls[0][1]).toEqual({
        aspect_ratio: '21:9',
        audio_urls: ['https://cdn.test/score.mp3'],
        duration: 12,
        generate_audio: false,
        image_urls: ['https://cdn.test/a.png'],
        prompt: 'match <<<image_1>>>',
        resolution: '480p',
        video_urls: ['https://cdn.test/ref.mp4'],
      });
    });

    it('reuses a caller idempotency key and keeps the payload untouched', async () => {
      mockHttpService.post.mockReturnValue(okResponse());

      await service.generateCinemaStudioVideo({
        idempotencyKey: 'durable-key',
        imageUrls: ['https://cdn.test/a.png', 'https://cdn.test/a.png'],
        prompt: 'p',
      });

      expect(
        mockHttpService.post.mock.calls[0][2].headers['Idempotency-Key'],
      ).toBe('durable-key');
      expect(mockHttpService.post.mock.calls[0][1].image_urls).toEqual([
        'https://cdn.test/a.png',
        'https://cdn.test/a.png',
      ]);
    });

    it.each([
      [{ prompt: '   ' }, 'non-empty prompt'],
      [{ duration: 3, prompt: 'p' }, 'duration'],
      [{ duration: 31, prompt: 'p' }, 'duration'],
      [{ duration: 5.5, prompt: 'p' }, 'duration'],
      [{ prompt: 'p', resolution: '1080p' }, 'resolution'],
      [{ aspectRatio: '2:3', prompt: 'p' }, 'aspect ratio'],
      [{ imageUrls: ['http://cdn.test/a.png'], prompt: 'p' }, 'https image'],
      [
        {
          imageUrls: Array.from(
            { length: 31 },
            (_, index) => `https://cdn.test/${index}.png`,
          ),
          prompt: 'p',
        },
        'at most 30',
      ],
    ])(
      'rejects invalid input %# before calling Higgsfield',
      async (input, message) => {
        await expect(
          service.generateCinemaStudioVideo(
            input as Parameters<typeof service.generateCinemaStudioVideo>[0],
          ),
        ).rejects.toThrow(message);
        expect(mockHttpService.post).not.toHaveBeenCalled();
      },
    );
  });

  describe('waitForVideoCompletion', () => {
    it('resolves the video URL from a completed envelope', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: {
          request_id: 'req-1',
          status: 'completed',
          video: { url: 'https://example.com/done.mp4' },
        },
      });

      await expect(service.waitForVideoCompletion('req-1')).resolves.toEqual({
        videoUrl: 'https://example.com/done.mp4',
      });
    });

    it('treats an nsfw verdict as a non-retryable rejection', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: { request_id: 'req-1', status: 'nsfw' },
      });

      await expect(
        service.waitForVideoCompletion('req-1'),
      ).rejects.toMatchObject({
        isRetryable: false,
        reason: AgentFailureReason.ACTION_NOT_ALLOWED,
      });
    });

    it('treats a failed job as retryable', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: { request_id: 'req-1', status: 'failed' },
      });

      await expect(
        service.waitForVideoCompletion('req-1'),
      ).rejects.toMatchObject({
        isRetryable: true,
        reason: AgentFailureReason.PROVIDER_UNAVAILABLE,
      });
    });

    it('stops on a cancelled job instead of polling to the timeout', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: { request_id: 'req-1', status: 'canceled' },
      });

      await expect(
        service.waitForVideoCompletion('req-1'),
      ).rejects.toMatchObject({
        isRetryable: false,
        reason: AgentFailureReason.CANCELLED,
      });
    });

    it('maps a poll timeout onto a timeout failure', async () => {
      mockPollUntilService.poll.mockRejectedValue(
        new PollTimeoutException('timed out', 1_000),
      );

      await expect(
        service.waitForVideoCompletion('req-1'),
      ).rejects.toMatchObject({ reason: AgentFailureReason.TIMEOUT });
    });
  });

  describe('waitForImageCompletion', () => {
    it('returns every rendered image', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: {
          images: [
            { url: 'https://example.com/a.png' },
            { url: 'https://example.com/b.png' },
          ],
          request_id: 'req-1',
          status: 'completed',
        },
      });

      await expect(service.waitForImageCompletion('req-1')).resolves.toEqual({
        imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
      });
    });

    it('rejects a completed job that carried no image', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        value: { request_id: 'req-no-output', status: 'completed' },
      });

      await expect(
        service.waitForImageCompletion('req-no-output'),
      ).rejects.toThrow('completed without an image');
    });
  });
});
