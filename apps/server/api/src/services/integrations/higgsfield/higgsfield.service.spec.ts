import { ConfigService } from '@api/config/config.service';
import { ByokService } from '@api/services/byok/byok.service';
import { HiggsFieldService } from '@api/services/integrations/higgsfield/higgsfield.service';
import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { PollUntilService } from '@api/shared/services/poll-until/poll-until.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

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
      resolveApiKey: vi.fn().mockResolvedValue(null),
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
        { provide: ByokService, useValue: mockByokService },
        { provide: PollUntilService, useValue: mockPollUntilService },
      ],
    }).compile();

    service = module.get<HiggsFieldService>(HiggsFieldService);
  });

  describe('generateImageToVideo', () => {
    it('should submit job and return request id', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          data: { request_id: 'req-abc' },
          status: 200,
        }),
      );

      const result = await service.generateImageToVideo({
        imageUrl: 'https://example.com/img.png',
        prompt: 'Test prompt',
      });

      expect(result.requestId).toBe('req-abc');
      expect(mockHttpService.post).toHaveBeenCalled();
    });

    it('should throw on auth failure', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => ({
          response: { data: 'Unauthorized', status: 401 },
        })),
      );

      await expect(
        service.generateImageToVideo({
          imageUrl: 'https://example.com/img.png',
          prompt: 'Test',
        }),
      ).rejects.toThrow('Higgsfield authorization failed');
    });

    it('should use BYOK credentials when organization has them', async () => {
      mockByokService.resolveApiKey.mockResolvedValue({
        apiKey: 'org-key',
        apiSecret: 'org-secret',
      });

      mockHttpService.post.mockReturnValue(
        of({ data: { request_id: 'req-byok' }, status: 200 }),
      );

      const result = await service.generateImageToVideo({
        imageUrl: 'https://example.com/img.png',
        organizationId: 'org-123',
        prompt: 'Test',
      });

      expect(result.requestId).toBe('req-byok');
      expect(mockByokService.resolveApiKey).toHaveBeenCalledWith(
        'org-123',
        expect.anything(),
      );
    });
  });

  describe('pollJob', () => {
    it('should return job status', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            output: { video_url: 'https://example.com/video.mp4' },
            status: 'completed',
          },
        }),
      );

      const result = await service.pollJob('req-123');

      expect(result.status).toBe('completed');
      expect(result.output?.video_url).toBe('https://example.com/video.mp4');
    });

    it('should return failed status on poll error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const result = await service.pollJob('req-123');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Poll request failed');
    });
  });

  describe('waitForCompletion', () => {
    it('should resolve when job completes', async () => {
      mockPollUntilService.poll.mockResolvedValue({
        attempts: 2,
        elapsedMs: 20,
        value: {
          output: { video_url: 'https://example.com/done.mp4' },
          status: 'completed',
        },
      });

      const result = await service.waitForCompletion('req-123', {
        pollIntervalMs: 10,
        timeoutMs: 5000,
      });

      expect(result.videoUrl).toBe('https://example.com/done.mp4');
    });

    it('should throw when job fails', async () => {
      // The isDone predicate throws when status is 'failed'.
      // Simulate PollUntilService propagating that error.
      mockPollUntilService.poll.mockRejectedValue(
        new Error('Higgsfield job req-123 failed: Generation failed'),
      );

      await expect(
        service.waitForCompletion('req-123', { pollIntervalMs: 10 }),
      ).rejects.toThrow('Higgsfield job req-123 failed');
    });

    it('should throw on timeout', async () => {
      mockPollUntilService.poll.mockRejectedValue(
        new PollTimeoutException('Poll timed out after 50ms', 50),
      );

      await expect(
        service.waitForCompletion('req-123', {
          pollIntervalMs: 10,
          timeoutMs: 50,
        }),
      ).rejects.toThrow('timed out');
    });
  });
});
