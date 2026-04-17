import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { KlingWebhookService } from '@api/endpoints/webhooks/klingai/webhooks.kling.service';
import type { KlingAIWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockDeps() {
  return {
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    metadataService: {
      findOne: vi.fn(),
      patch: vi.fn(),
    },
  };
}

describe('KlingWebhookService', () => {
  let service: KlingWebhookService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(async () => {
    deps = createMockDeps();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KlingWebhookService,
        { provide: LoggerService, useValue: deps.logger },
        { provide: MetadataService, useValue: deps.metadataService },
      ],
    }).compile();

    service = module.get<KlingWebhookService>(KlingWebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- extractMediaUrls ---

  describe('extractMediaUrls', () => {
    it('should extract video URLs from nested object', () => {
      const result = service.extractMediaUrls({
        works: [{ resource: { resource: 'https://cdn.kling.ai/video.mp4' } }],
      });
      expect(result.videoUrls).toContain('https://cdn.kling.ai/video.mp4');
    });

    it('should classify image URLs by extension', () => {
      const result = service.extractMediaUrls({
        cover_image_url: 'https://cdn.kling.ai/thumb.jpg',
      });
      expect(result.imageUrls).toContain('https://cdn.kling.ai/thumb.jpg');
      expect(result.videoUrls).toHaveLength(0);
    });

    it('should classify URLs by key name when no extension matches', () => {
      const result = service.extractMediaUrls({
        image_url: 'https://cdn.kling.ai/image/abc123',
        video_url: 'https://cdn.kling.ai/stream/abc123',
      });
      expect(result.videoUrls).toContain('https://cdn.kling.ai/stream/abc123');
      expect(result.imageUrls).toContain('https://cdn.kling.ai/image/abc123');
    });

    it('should default ambiguous URLs to video', () => {
      const result = service.extractMediaUrls({
        output: 'https://cdn.kling.ai/result/abc123',
      });
      expect(result.videoUrls).toContain('https://cdn.kling.ai/result/abc123');
    });

    it('should skip non-HTTP strings', () => {
      const result = service.extractMediaUrls({
        empty: '',
        note: 'ftp://not-http.com/file',
        status: 'succeed',
      });
      expect(result.videoUrls).toHaveLength(0);
      expect(result.imageUrls).toHaveLength(0);
    });

    it('should deduplicate URLs', () => {
      const url = 'https://cdn.kling.ai/video.mp4';
      const result = service.extractMediaUrls({
        a: url,
        b: url,
        nested: { c: url },
      });
      expect(result.videoUrls).toHaveLength(1);
    });

    it('should handle null / undefined input gracefully', () => {
      expect(service.extractMediaUrls(null).videoUrls).toHaveLength(0);
      expect(service.extractMediaUrls(undefined).videoUrls).toHaveLength(0);
    });
  });

  // --- handleCallback ---

  describe('handleCallback', () => {
    it('should return early when no task_id', async () => {
      const body = { custom_id: 'abc' } as KlingAIWebhookPayload;

      await service.handleCallback(body);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no task_id'),
      );
      expect(deps.metadataService.findOne).not.toHaveBeenCalled();
    });

    it('should return early when no custom_id', async () => {
      const body = { task_id: 'task-1' } as KlingAIWebhookPayload;

      await service.handleCallback(body);

      expect(deps.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no custom_id'),
      );
    });

    it('should return early when metadata not found', async () => {
      const metadataId = '507f191e810c19729de860ee';
      const body = {
        custom_id: metadataId,
        task_id: 'task-1',
        task_status: 'succeed',
      } as KlingAIWebhookPayload;

      deps.metadataService.findOne.mockResolvedValue(null);

      await service.handleCallback(body);

      expect(deps.metadataService.patch).not.toHaveBeenCalled();
    });

    it('should patch with first video URL on succeed', async () => {
      const metadataId = '507f191e810c19729de860ee';
      const body = {
        custom_id: metadataId,
        task_id: 'task-1',
        task_result: {
          videos: [{ url: 'https://cdn.kling.ai/result.mp4' }],
        },
        task_status: 'succeed',
      } as KlingAIWebhookPayload;

      deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
      deps.metadataService.patch.mockResolvedValue({});

      await service.handleCallback(body);

      expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
        error: null,
        result: 'https://cdn.kling.ai/result.mp4',
      });
    });

    it('should stringify task_result when no URLs found', async () => {
      const metadataId = '507f191e810c19729de860ee';
      const taskResult = { data: 'some non-url data' };
      const body = {
        custom_id: metadataId,
        task_id: 'task-1',
        task_result: taskResult,
        task_status: 'succeed',
      } as KlingAIWebhookPayload;

      deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
      deps.metadataService.patch.mockResolvedValue({});

      await service.handleCallback(body);

      expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
        error: null,
        result: JSON.stringify(taskResult),
      });
    });

    it('should patch with error message on failed status', async () => {
      const metadataId = '507f191e810c19729de860ee';
      const body = {
        custom_id: metadataId,
        task_id: 'task-1',
        task_result: { message: 'Content policy violation' },
        task_status: 'failed',
      } as KlingAIWebhookPayload;

      deps.metadataService.findOne.mockResolvedValue({ _id: metadataId });
      deps.metadataService.patch.mockResolvedValue({});

      await service.handleCallback(body);

      expect(deps.metadataService.patch).toHaveBeenCalledWith(metadataId, {
        error: 'Content policy violation',
      });
    });

    it('should rethrow errors from metadataService', async () => {
      const metadataId = '507f191e810c19729de860ee';
      const body = {
        custom_id: metadataId,
        task_id: 'task-1',
        task_status: 'succeed',
      } as KlingAIWebhookPayload;

      deps.metadataService.findOne.mockRejectedValue(new Error('DB down'));

      await expect(service.handleCallback(body)).rejects.toThrow('DB down');
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });
});
