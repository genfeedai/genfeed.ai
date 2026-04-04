import { Test, type TestingModule } from '@nestjs/testing';
import { TTSController } from '@voices/controllers/tts.controller';
import type { TTSJob } from '@voices/interfaces/voices.interfaces';
import { JobService } from '@voices/services/job.service';
import { TTSService } from '@voices/services/tts.service';

describe('TTSController', () => {
  let controller: TTSController;

  const mockTTSService = {
    generate: vi.fn(),
  };

  const mockJobService = {
    getJob: vi.fn(),
  };

  const baseJob: TTSJob = {
    createdAt: new Date().toISOString(),
    jobId: 'tts-job-1',
    params: {},
    status: 'queued',
    type: 'tts',
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TTSController],
      providers: [
        {
          provide: TTSService,
          useValue: mockTTSService,
        },
        {
          provide: JobService,
          useValue: mockJobService,
        },
      ],
    }).compile();

    controller = module.get<TTSController>(TTSController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generate', () => {
    it('should delegate to TTSService.generate', async () => {
      const body = { text: 'Hello world' };
      mockTTSService.generate.mockResolvedValue(baseJob);

      const result = await controller.generate(body);

      expect(mockTTSService.generate).toHaveBeenCalledWith(body);
      expect(result).toEqual(baseJob);
    });

    it('should pass voiceId and language to the service', async () => {
      const body = { language: 'en', text: 'Test', voiceId: 'voice-abc' };
      mockTTSService.generate.mockResolvedValue(baseJob);

      await controller.generate(body);

      expect(mockTTSService.generate).toHaveBeenCalledWith({
        language: 'en',
        text: 'Test',
        voiceId: 'voice-abc',
      });
    });

    it('should pass speed option to the service', async () => {
      const body = { speed: 1.5, text: 'Fast speech' };
      mockTTSService.generate.mockResolvedValue({
        ...baseJob,
        jobId: 'fast-1',
      });

      const result = await controller.generate(body);

      expect(mockTTSService.generate).toHaveBeenCalledWith(body);
      expect(result.jobId).toBe('fast-1');
    });

    it('should propagate errors from TTSService', async () => {
      const body = { text: 'Error case' };
      mockTTSService.generate.mockRejectedValue(new Error('TTS unavailable'));

      await expect(controller.generate(body)).rejects.toThrow(
        'TTS unavailable',
      );
    });

    it('should return job with completed status on success', async () => {
      const completedJob: TTSJob = {
        ...baseJob,
        audioUrl: 'https://storage.example.com/audio.mp3',
        completedAt: new Date().toISOString(),
        status: 'completed',
      };

      mockTTSService.generate.mockResolvedValue(completedJob);

      const result = await controller.generate({ text: 'Done' });

      expect(result.status).toBe('completed');
      expect(result.audioUrl).toBe('https://storage.example.com/audio.mp3');
    });
  });

  describe('getJobStatus', () => {
    it('should return job from JobService by id', async () => {
      mockJobService.getJob.mockResolvedValue(baseJob);

      const result = await controller.getJobStatus('tts-job-1');

      expect(mockJobService.getJob).toHaveBeenCalledWith('tts-job-1');
      expect(result).toEqual(baseJob);
    });

    it('should return null when job is not found', async () => {
      mockJobService.getJob.mockResolvedValue(null);

      const result = await controller.getJobStatus('nonexistent');

      expect(result).toBeNull();
    });

    it('should return a failed job', async () => {
      const failedJob: TTSJob = {
        ...baseJob,
        completedAt: new Date().toISOString(),
        error: 'Synthesis failed',
        status: 'failed',
      };

      mockJobService.getJob.mockResolvedValue(failedJob);

      const result = await controller.getJobStatus('failed-job');

      expect(result?.status).toBe('failed');
      expect(result?.error).toBe('Synthesis failed');
    });
  });
});
