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

const PLATFORM = 'https://platform.higgsfield.ai';

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
        `${PLATFORM}/v1/image2video/dop`,
        {
          input_images: [
            { image_url: 'https://example.com/img.png', type: 'image_url' },
          ],
          model: 'dop-turbo',
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
        `${PLATFORM}/v1/image2video/dop?hf_webhook=${encodeURIComponent('https://app.test/hook')}`,
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('generateTextToImage', () => {
    it('snaps the aspect ratio onto a supported Soul size', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        aspectRatio: '9:16',
        prompt: 'A portrait',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        `${PLATFORM}/v1/text2image/soul`,
        {
          batch_size: 1,
          prompt: 'A portrait',
          quality: '1080p',
          width_and_height: '1152x2048',
        },
        expect.any(Object),
      );
    });

    it('falls back to square for a ratio Soul does not render', async () => {
      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-soul', status: 'queued' }, status: 200 }),
      );

      await service.generateTextToImage({
        aspectRatio: '21:9',
        prompt: 'A panorama',
      });

      expect(mockHttpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ width_and_height: '1536x1536' }),
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
      ).rejects.toBeDefined();
    });
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
