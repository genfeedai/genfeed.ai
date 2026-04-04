import { Test, TestingModule } from '@nestjs/testing';
import { GenerationController } from '@videos/controllers/generation.controller';
import { GenerationService } from '@videos/services/generation.service';
import { JobService } from '@videos/services/job.service';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('GenerationController', () => {
  let controller: GenerationController;
  let generationService: Mocked<GenerationService>;
  let jobService: Mocked<JobService>;

  const mockJob = {
    createdAt: new Date().toISOString(),
    jobId: 'vid-job-001',
    params: {},
    status: 'queued' as const,
    type: 'video',
  };

  beforeEach(async () => {
    const mockGenerationService = {
      generateVideo: vi.fn().mockResolvedValue(mockJob),
    } as unknown as Mocked<GenerationService>;

    const mockJobService = {
      getJob: vi.fn().mockResolvedValue(mockJob),
    } as unknown as Mocked<JobService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GenerationController],
      providers: [
        { provide: GenerationService, useValue: mockGenerationService },
        { provide: JobService, useValue: mockJobService },
      ],
    }).compile();

    controller = module.get<GenerationController>(GenerationController);
    generationService = module.get(GenerationService);
    jobService = module.get(JobService);

    vi.clearAllMocks();
  });

  describe('generateVideo', () => {
    const generateBody = {
      duration: 5,
      model: 'higgsfield-v1',
      prompt: 'A serene mountain landscape at sunrise',
    };

    it('should call generationService.generateVideo with the request body', async () => {
      await controller.generateVideo(generateBody);

      expect(generationService.generateVideo).toHaveBeenCalledWith(
        generateBody,
      );
    });

    it('should return the queued job', async () => {
      const result = await controller.generateVideo(generateBody);

      expect(result).toEqual(mockJob);
    });

    it('should pass negativePrompt when provided', async () => {
      const bodyWithNeg = {
        ...generateBody,
        negativePrompt: 'blurry, low quality',
      };

      await controller.generateVideo(bodyWithNeg);

      expect(generationService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ negativePrompt: 'blurry, low quality' }),
      );
    });

    it('should pass sourceImageUrl for image-to-video', async () => {
      const bodyWithImage = {
        ...generateBody,
        sourceImageUrl: 'https://cdn.example.com/source.jpg',
      };

      await controller.generateVideo(bodyWithImage);

      expect(generationService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceImageUrl: 'https://cdn.example.com/source.jpg',
        }),
      );
    });

    it('should pass resolution parameters when provided', async () => {
      const bodyWithRes = {
        ...generateBody,
        fps: 30,
        height: 1080,
        width: 1920,
      };

      await controller.generateVideo(bodyWithRes);

      expect(generationService.generateVideo).toHaveBeenCalledWith(
        expect.objectContaining({ fps: 30, height: 1080, width: 1920 }),
      );
    });

    it('should propagate service errors to caller', async () => {
      generationService.generateVideo = vi
        .fn()
        .mockRejectedValue(new Error('Model unavailable'));

      await expect(controller.generateVideo(generateBody)).rejects.toThrow(
        'Model unavailable',
      );
    });

    it('should work with prompt-only request', async () => {
      const minimalBody = { prompt: 'Simple prompt' };

      const result = await controller.generateVideo(minimalBody);

      expect(generationService.generateVideo).toHaveBeenCalledWith(minimalBody);
      expect(result).toEqual(mockJob);
    });
  });

  describe('getJobStatus', () => {
    it('should call jobService.getJob with the jobId', async () => {
      await controller.getJobStatus('vid-job-001');

      expect(jobService.getJob).toHaveBeenCalledWith('vid-job-001');
    });

    it('should return the job status', async () => {
      const result = await controller.getJobStatus('vid-job-001');

      expect(result).toEqual(mockJob);
    });

    it('should return null when job does not exist', async () => {
      jobService.getJob = vi.fn().mockResolvedValue(null);

      const result = await controller.getJobStatus('nonexistent');

      expect(result).toBeNull();
    });

    it('should return completed job with video URL', async () => {
      const completedJob = {
        ...mockJob,
        completedAt: new Date().toISOString(),
        status: 'completed' as const,
        videoUrl: 'https://cdn.example.com/video.mp4',
      };
      jobService.getJob = vi.fn().mockResolvedValue(completedJob);

      const result = await controller.getJobStatus('vid-job-001');

      expect(result).toMatchObject({
        status: 'completed',
        videoUrl: 'https://cdn.example.com/video.mp4',
      });
    });

    it('should propagate service errors', async () => {
      jobService.getJob = vi
        .fn()
        .mockRejectedValue(new Error('DB connection error'));

      await expect(controller.getJobStatus('vid-job-001')).rejects.toThrow(
        'DB connection error',
      );
    });
  });
});
