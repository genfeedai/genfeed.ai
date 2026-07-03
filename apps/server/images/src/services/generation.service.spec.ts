import { ConfigService } from '@images/config/config.service';
import type {
  GenerateImageRequest,
  GeneratePulidRequest,
  GenerationJob,
} from '@images/interfaces/images.interfaces';
import { ComfyUIService } from '@images/services/comfyui.service';
import { JobService } from '@images/services/job.service';
import { LoggerService } from '@libs/logger/logger.service';
import { S3Service } from '@libs/s3/s3.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { GenerationService } from './generation.service';

vi.mock('@genfeedai/workflows/comfyui', () => ({
  buildFlux2DevPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'flux2-dev',
  })),
  buildFlux2DevPulidPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'flux2-dev-pulid',
  })),
  buildFlux2DevPulidUpscalePrompt: vi.fn(
    (request: Record<string, unknown>) => ({
      request,
      workflow: 'flux2-dev-pulid-upscale',
    }),
  ),
  buildFlux2KleinPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'flux2-klein',
  })),
  buildFluxDevPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'flux-dev',
  })),
  buildPulidFluxPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'pulid-flux',
  })),
  buildZImageTurboPrompt: vi.fn((request: Record<string, unknown>) => ({
    request,
    workflow: 'z-image-turbo',
  })),
}));

const flushAsyncJob = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('GenerationService', () => {
  let service: GenerationService;
  let jobService: {
    createJob: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
    updateJob: ReturnType<typeof vi.fn>;
  };
  let comfyuiService: {
    getStatus: ReturnType<typeof vi.fn>;
    queueAndWait: ReturnType<typeof vi.fn>;
  };
  let s3Service: {
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationService,
        {
          provide: ConfigService,
          useValue: {
            AWS_S3_BUCKET: 'test-bucket',
            COMFYUI_OUTPUT_PATH: '/tmp/comfyui-output',
            COMFYUI_URL: 'http://localhost:8188',
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
        {
          provide: JobService,
          useValue: {
            createJob: vi.fn().mockImplementation(
              async ({
                params,
                type,
              }: {
                params: Record<string, unknown>;
                type: string;
              }): Promise<GenerationJob> => ({
                createdAt: '2026-01-01T00:00:00.000Z',
                jobId: `job-${type}`,
                params,
                status: 'queued',
                type,
              }),
            ),
            getJob: vi.fn(),
            updateJob: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ComfyUIService,
          useValue: {
            getStatus: vi
              .fn()
              .mockResolvedValue({ status: 'online', url: 'http://comfyui' }),
            queueAndWait: vi.fn().mockResolvedValue({
              filename: 'generated.png',
              subfolder: 'runs',
              type: 'output',
            }),
          },
        },
        {
          provide: S3Service,
          useValue: {
            uploadFile: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(GenerationService);
    jobService = module.get(JobService);
    comfyuiService = module.get(ComfyUIService);
    s3Service = module.get(S3Service);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateImage()', () => {
    const imageRequest: GenerateImageRequest = {
      height: 1024,
      model: 'sd_xl',
      prompt: 'a beautiful sunset over the mountains',
      seed: 123,
      width: 1024,
    };

    it('queues an image job and completes it through ComfyUI', async () => {
      const result = await service.generateImage(imageRequest);

      expect(result).toMatchObject({
        jobId: 'job-image',
        status: 'queued',
        type: 'image',
      });
      expect(jobService.createJob).toHaveBeenCalledWith({
        params: imageRequest,
        type: 'image',
      });

      await flushAsyncJob();

      expect(jobService.updateJob).toHaveBeenCalledWith('job-image', {
        status: 'processing',
      });
      expect(comfyuiService.queueAndWait).toHaveBeenCalledWith(
        expect.objectContaining({ workflow: 'flux-dev' }),
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/images/generated/job-image/generated.png',
        '/tmp/comfyui-output/runs/generated.png',
        'image/png',
      );
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({
          resultUrl:
            'https://cdn.genfeed.ai/ingredients/images/generated/job-image/generated.png',
          status: 'completed',
        }),
      );
    });

    it('marks the job failed when ComfyUI is offline', async () => {
      comfyuiService.getStatus.mockResolvedValueOnce({
        status: 'offline',
        url: 'http://comfyui',
      });

      await service.generateImage(imageRequest);
      await flushAsyncJob();

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({
          error: 'ComfyUI is offline',
          status: 'failed',
        }),
      );
    });

    it('marks the job failed (not completed) when S3 upload fails', async () => {
      s3Service.uploadFile.mockRejectedValueOnce(new Error('upload failed'));

      await service.generateImage(imageRequest);
      await flushAsyncJob();

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: 'Image generation S3 upload failed',
        }),
      );
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({
          error: expect.stringContaining('S3 upload failed'),
          status: 'failed',
        }),
      );
      expect(jobService.updateJob).not.toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('fails closed when the ComfyUI output subfolder escapes the output path', async () => {
      comfyuiService.queueAndWait.mockResolvedValueOnce({
        filename: 'generated.png',
        subfolder: '../../../../etc',
      });

      await service.generateImage(imageRequest);
      await flushAsyncJob();

      // Traversal subfolder must be rejected before any upload happens.
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(jobService.updateJob).not.toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('strips directory components from a traversal ComfyUI filename', async () => {
      comfyuiService.queueAndWait.mockResolvedValueOnce({
        filename: '../../../../etc/passwd',
        subfolder: 'runs',
      });

      await service.generateImage(imageRequest);
      await flushAsyncJob();

      // basename() reduces the filename to 'passwd', keeping the local path and
      // S3 key inside the configured COMFYUI_OUTPUT_PATH root.
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/images/generated/job-image/passwd',
        '/tmp/comfyui-output/runs/passwd',
        expect.any(String),
      );
    });

    it('marks unsupported image models failed', async () => {
      await service.generateImage({
        model: 'unsupported-model',
        prompt: 'test',
      });
      await flushAsyncJob();

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-image',
        expect.objectContaining({
          error: 'Unsupported image model: unsupported-model',
          status: 'failed',
        }),
      );
    });
  });

  describe('generatePulid()', () => {
    const pulidRequest: GeneratePulidRequest = {
      model: 'pulid_v1',
      prompt: 'a professional headshot',
      referenceImageUrl: 'https://example.com/face.jpg',
    };

    it('queues a PuLID job and stores the generated result', async () => {
      const result = await service.generatePulid(pulidRequest);

      expect(result).toMatchObject({
        jobId: 'job-pulid',
        status: 'queued',
        type: 'pulid',
      });
      expect(jobService.createJob).toHaveBeenCalledWith({
        params: pulidRequest,
        type: 'pulid',
      });

      await flushAsyncJob();

      expect(comfyuiService.queueAndWait).toHaveBeenCalledWith(
        expect.objectContaining({ workflow: 'pulid-flux' }),
      );
      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'test-bucket',
        'ingredients/pulid/generated/job-pulid/generated.png',
        '/tmp/comfyui-output/runs/generated.png',
        'image/png',
      );
      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-pulid',
        expect.objectContaining({
          resultUrl:
            'https://cdn.genfeed.ai/ingredients/pulid/generated/job-pulid/generated.png',
          status: 'completed',
        }),
      );
    });

    it('marks unsupported PuLID models failed', async () => {
      await service.generatePulid({
        model: 'unsupported-pulid',
        prompt: 'test',
        referenceImageUrl: 'https://example.com/face.jpg',
      });
      await flushAsyncJob();

      expect(jobService.updateJob).toHaveBeenCalledWith(
        'job-pulid',
        expect.objectContaining({
          error: 'Unsupported PuLID model: unsupported-pulid',
          status: 'failed',
        }),
      );
    });
  });
});
