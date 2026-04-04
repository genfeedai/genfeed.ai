import type { GenerationJob } from '@images/interfaces/images.interfaces';
import { GenerationService } from '@images/services/generation.service';
import { JobService } from '@images/services/job.service';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerationController } from './generation.controller';

vi.mock('@images/services/generation.service');
vi.mock('@images/services/job.service');

describe('GenerationController', () => {
  let controller: GenerationController;
  let generationService: {
    generateImage: ReturnType<typeof vi.fn>;
    generatePulid: ReturnType<typeof vi.fn>;
  };
  let jobService: { getJob: ReturnType<typeof vi.fn> };

  const mockJob: GenerationJob = {
    createdAt: '2026-01-01T00:00:00.000Z',
    jobId: 'job-xyz-999',
    params: { prompt: 'test' },
    status: 'queued',
    type: 'image',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        {
          provide: GenerationService,
          useValue: {
            generateImage: vi.fn().mockResolvedValue(mockJob),
            generatePulid: vi.fn().mockResolvedValue(mockJob),
          },
        },
        {
          provide: JobService,
          useValue: {
            getJob: vi.fn().mockReturnValue(mockJob),
          },
        },
      ],
    }).compile();

    controller = module.get(GenerationController);
    generationService = module.get(GenerationService);
    jobService = module.get(JobService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateImage()', () => {
    it('delegates to generationService.generateImage with full body', async () => {
      const body = {
        height: 1024,
        lora: 'my-lora',
        model: 'sd_xl',
        negativePrompt: 'blur',
        prompt: 'a cyberpunk city',
        seed: 42,
        width: 1024,
      };
      await controller.generateImage(body);
      expect(generationService.generateImage).toHaveBeenCalledWith(body);
    });

    it('returns job from generationService', async () => {
      const result = await controller.generateImage({ prompt: 'test' });
      expect(result).toEqual(mockJob);
    });

    it('propagates service errors', async () => {
      generationService.generateImage.mockRejectedValue(
        new Error('ComfyUI not wired'),
      );
      await expect(
        controller.generateImage({ prompt: 'test' }),
      ).rejects.toThrow('ComfyUI not wired');
    });

    it('passes minimal prompt-only body', async () => {
      const body = { prompt: 'simple prompt' };
      await controller.generateImage(body);
      expect(generationService.generateImage).toHaveBeenCalledWith(body);
    });
  });

  describe('generatePulid()', () => {
    it('delegates to generationService.generatePulid with body', async () => {
      const body = {
        height: 512,
        model: 'pulid_v1',
        prompt: 'professional headshot',
        referenceImageUrl: 'https://example.com/ref.jpg',
        width: 512,
      };
      await controller.generatePulid(body);
      expect(generationService.generatePulid).toHaveBeenCalledWith(body);
    });

    it('returns job from generationService', async () => {
      const result = await controller.generatePulid({
        prompt: 'headshot',
        referenceImageUrl: 'https://example.com/face.jpg',
      });
      expect(result).toEqual(mockJob);
    });

    it('propagates service errors', async () => {
      generationService.generatePulid.mockRejectedValue(
        new Error('PuLID not wired'),
      );
      await expect(
        controller.generatePulid({
          prompt: 'test',
          referenceImageUrl: 'http://img.jpg',
        }),
      ).rejects.toThrow('PuLID not wired');
    });
  });

  describe('getJobStatus()', () => {
    it('delegates to jobService.getJob with jobId param', () => {
      controller.getJobStatus('job-xyz-999');
      expect(jobService.getJob).toHaveBeenCalledWith('job-xyz-999');
    });

    it('returns the job from jobService', () => {
      const result = controller.getJobStatus('job-xyz-999');
      expect(result).toEqual(mockJob);
    });

    it('returns null when job not found', () => {
      jobService.getJob.mockReturnValue(null);
      const result = controller.getJobStatus('missing-job');
      expect(result).toBeNull();
    });

    it('passes arbitrary jobId strings through unchanged', () => {
      controller.getJobStatus('00000000-0000-0000-0000-000000000000');
      expect(jobService.getJob).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000000',
      );
    });
  });
});
