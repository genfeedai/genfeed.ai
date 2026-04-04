import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@videos/config/config.service';
import type { GenerateVideoRequest } from '@videos/interfaces/videos.interfaces';
import { ComfyUIService } from '@videos/services/comfyui.service';
import { GenerationService } from '@videos/services/generation.service';
import { JobService } from '@videos/services/job.service';
import { S3Service } from '@videos/services/s3.service';
import { WorkflowService } from '@videos/services/workflow.service';

describe('GenerationService', () => {
  let service: GenerationService;
  let jobService: {
    createJob: ReturnType<typeof vi.fn>;
    updateJob: ReturnType<typeof vi.fn>;
  };
  let comfyuiService: {
    getStatus: ReturnType<typeof vi.fn>;
    queueAndWait: ReturnType<typeof vi.fn>;
  };
  let workflowService: {
    buildWan22I2V: ReturnType<typeof vi.fn>;
  };
  let s3Service: {
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let loggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const mockConfig = {
    AWS_S3_BUCKET: 'test-bucket',
    COMFYUI_OUTPUT_PATH: '/comfyui/output',
  };

  const baseRequest: GenerateVideoRequest = {
    model: 'wan22',
    prompt: 'A cat running through a field',
  };

  const mockJob = {
    createdAt: new Date().toISOString(),
    jobId: 'job-abc-123',
    params: {},
    status: 'queued' as const,
    type: 'text-to-video',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    jobService = {
      createJob: vi.fn().mockResolvedValue(mockJob),
      updateJob: vi.fn().mockResolvedValue({ ...mockJob, status: 'completed' }),
    };
    comfyuiService = {
      getStatus: vi.fn().mockResolvedValue({ status: 'online' }),
      queueAndWait: vi.fn().mockResolvedValue('output-video.mp4'),
    };
    workflowService = {
      buildWan22I2V: vi.fn().mockReturnValue({ nodes: {} }),
    };
    s3Service = {
      uploadFile: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: LoggerService, useValue: loggerService },
        { provide: JobService, useValue: jobService },
        { provide: ComfyUIService, useValue: comfyuiService },
        { provide: WorkflowService, useValue: workflowService },
        { provide: S3Service, useValue: s3Service },
      ],
    }).compile();

    service = module.get<GenerationService>(GenerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateVideo', () => {
    it('should create a job and return it immediately', async () => {
      const result = await service.generateVideo(baseRequest);

      expect(result).toEqual(mockJob);
      expect(jobService.createJob).toHaveBeenCalledOnce();
    });

    it('should create a text-to-video job when no sourceImageUrl is provided', async () => {
      await service.generateVideo(baseRequest);

      expect(jobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'text-to-video' }),
      );
    });

    it('should create an image-to-video job when sourceImageUrl is provided', async () => {
      await service.generateVideo({
        ...baseRequest,
        sourceImageUrl: 'https://example.com/source.jpg',
      });

      expect(jobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'image-to-video' }),
      );
    });

    it('should fire async processing without blocking the response', async () => {
      // processVideoJob is fire-and-forget; result is returned before ComfyUI finishes
      let comfyUIResolved = false;
      comfyuiService.queueAndWait.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => {
              comfyUIResolved = true;
              resolve('video.mp4');
            }, 50),
          ),
      );

      const result = await service.generateVideo(baseRequest);

      // Job returned immediately, ComfyUI not yet done
      expect(result.jobId).toBe('job-abc-123');
      expect(comfyUIResolved).toBe(false);
    });

    it('should call workflowService.buildWan22I2V during async processing', async () => {
      await service.generateVideo(baseRequest);

      // Wait for async processing to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(workflowService.buildWan22I2V).toHaveBeenCalledOnce();
    });

    it('should update job to processing status before ComfyUI call', async () => {
      await service.generateVideo(baseRequest);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith('job-abc-123', {
        status: 'processing',
      });
    });

    it('should upload to S3 and set CDN videoUrl on success', async () => {
      await service.generateVideo(baseRequest);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('videos/generated/job-abc-123'),
        expect.stringContaining('output-video.mp4'),
        'video/mp4',
      );

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-abc-123',
        expect.objectContaining({
          status: 'completed',
          videoUrl: expect.stringContaining('cdn.genfeed.ai'),
        }),
      );
    });

    it('should set status to failed when ComfyUI is offline', async () => {
      comfyuiService.getStatus.mockResolvedValue({ status: 'offline' });

      await service.generateVideo(baseRequest);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-abc-123',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('should set status to failed when ComfyUI returns no output', async () => {
      comfyuiService.queueAndWait.mockResolvedValue(null);

      await service.generateVideo(baseRequest);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-abc-123',
        expect.objectContaining({
          error: expect.any(String),
          status: 'failed',
        }),
      );
    });

    it('should fall back to local filename URL when S3 upload fails', async () => {
      s3Service.uploadFile.mockRejectedValue(new Error('S3 unreachable'));

      await service.generateVideo(baseRequest);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-abc-123',
        expect.objectContaining({
          status: 'completed',
          videoUrl: 'output-video.mp4',
        }),
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
