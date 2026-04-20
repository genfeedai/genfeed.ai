import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { OpusProWebhookService } from '@api/endpoints/webhooks/opuspro/webhooks.opuspro.service';
import { MicroservicesService } from '@api/services/microservices/microservices.service';
import type { OpusProWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('OpusProWebhookService', () => {
  let service: OpusProWebhookService;
  let metadataService: vi.Mocked<MetadataService>;
  let microservicesService: vi.Mocked<MicroservicesService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpusProWebhookService,
        {
          provide: MetadataService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: MicroservicesService,
          useValue: {
            notifyWebhook: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OpusProWebhookService>(OpusProWebhookService);
    metadataService = module.get(MetadataService);
    microservicesService = module.get(MicroservicesService);
    loggerService = module.get(LoggerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractVideoUrl', () => {
    it('should return videoUrl when present', () => {
      const payload = {
        videoUrl: 'https://cdn.opuspro.ai/video.mp4',
      } as OpusProWebhookPayload;

      expect(service.extractVideoUrl(payload)).toBe(
        'https://cdn.opuspro.ai/video.mp4',
      );
    });

    it('should fall back to video_url when videoUrl is absent', () => {
      const payload = {
        video_url: 'https://cdn.opuspro.ai/video_url.mp4',
      } as OpusProWebhookPayload;

      expect(service.extractVideoUrl(payload)).toBe(
        'https://cdn.opuspro.ai/video_url.mp4',
      );
    });

    it('should return undefined when neither videoUrl nor video_url is present', () => {
      const payload = { status: 'completed' } as OpusProWebhookPayload;

      expect(service.extractVideoUrl(payload)).toBeUndefined();
    });

    it('should prefer videoUrl over video_url', () => {
      const payload = {
        video_url: 'https://cdn.example.com/fallback.mp4',
        videoUrl: 'https://cdn.example.com/primary.mp4',
      } as OpusProWebhookPayload;

      expect(service.extractVideoUrl(payload)).toBe(
        'https://cdn.example.com/primary.mp4',
      );
    });
  });

  describe('handleCallback', () => {
    it('should notify the microservice for every payload', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_001',
        status: 'processing',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({
        _id: mockId,
      } as never);

      await service.handleCallback(payload);

      expect(microservicesService.notifyWebhook).toHaveBeenCalledWith(
        'opuspro',
        'processing',
        expect.objectContaining({
          callback_id: 'cb_001',
          metadata: expect.objectContaining({
            callbackId: 'cb_001',
            timestamp: expect.any(String),
          }),
        }),
      );
    });

    it('should warn and return early when callback_id is absent', async () => {
      const payload = { status: 'completed' } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);

      await service.handleCallback(payload);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('no callback_id provided'),
      );
      expect(metadataService.findOne).not.toHaveBeenCalled();
    });

    it('should warn and return when metadata is not found', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_notfound',
        status: 'completed',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue(null);

      await service.handleCallback(payload);

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('metadata not found'),
        { callback_id: 'cb_notfound' },
      );
      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should patch metadata with videoUrl on completed status', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_complete',
        status: 'completed',
        videoUrl: 'https://cdn.opuspro.ai/result.mp4',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({ _id: mockId } as never);
      metadataService.patch.mockResolvedValue({} as never);

      await service.handleCallback(payload);

      expect(metadataService.patch).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({
          error: null,
          result: 'https://cdn.opuspro.ai/result.mp4',
        }),
      );
    });

    it('should patch metadata with error on failed status', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_fail',
        error: 'GPU timeout',
        status: 'failed',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({ _id: mockId } as never);
      metadataService.patch.mockResolvedValue({} as never);

      await service.handleCallback(payload);

      expect(metadataService.patch).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({ error: 'GPU timeout' }),
      );
    });

    it('should use default error message when failed payload has no error field', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_fail_default',
        status: 'failed',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({ _id: mockId } as never);
      metadataService.patch.mockResolvedValue({} as never);

      await service.handleCallback(payload);

      expect(metadataService.patch).toHaveBeenCalledWith(
        mockId,
        expect.objectContaining({
          error: 'Opus Pro generation failed',
        }),
      );
    });

    it('should NOT patch metadata when status is neither completed nor failed', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_processing',
        status: 'processing',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({ _id: mockId } as never);

      await service.handleCallback(payload);

      expect(metadataService.patch).not.toHaveBeenCalled();
    });

    it('should log completion after successful handling', async () => {
      const mockId = '507f191e810c19729de860ee';
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_log',
        status: 'processing',
      } as OpusProWebhookPayload;

      microservicesService.notifyWebhook.mockResolvedValue(undefined);
      metadataService.findOne.mockResolvedValue({ _id: mockId } as never);

      await service.handleCallback(payload);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.objectContaining({
          callback_id: 'cb_log',
          status: 'processing',
        }),
      );
    });

    it('should log and rethrow errors', async () => {
      const payload: OpusProWebhookPayload = {
        callback_id: 'cb_err',
        status: 'processing',
      } as OpusProWebhookPayload;

      const error = new Error('DB write failed');
      microservicesService.notifyWebhook.mockRejectedValue(error);

      await expect(service.handleCallback(payload)).rejects.toThrow(
        'DB write failed',
      );

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        error,
      );
    });
  });
});
