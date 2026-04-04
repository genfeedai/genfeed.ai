import { Test, TestingModule } from '@nestjs/testing';
import { VoiceTrainingController } from '@voices/controllers/voice-training.controller';
import { VoiceTrainingService } from '@voices/services/voice-training.service';

describe('VoiceTrainingController', () => {
  let controller: VoiceTrainingController;
  let voiceTrainingService: {
    getJob: ReturnType<typeof vi.fn>;
    listJobs: ReturnType<typeof vi.fn>;
    startTraining: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceTrainingController],
      providers: [
        {
          provide: VoiceTrainingService,
          useValue: {
            getJob: vi.fn().mockResolvedValue({
              jobId: 'job-1',
              status: 'training',
            }),
            listJobs: vi.fn().mockResolvedValue([
              { jobId: 'job-1', status: 'completed' },
              { jobId: 'job-2', status: 'training' },
            ]),
            startTraining: vi.fn().mockResolvedValue({
              jobId: 'job-new',
              status: 'queued',
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(VoiceTrainingController);
    voiceTrainingService = module.get(VoiceTrainingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startTraining', () => {
    it('delegates to VoiceTrainingService.startTraining', async () => {
      const body = {
        audioUrl: 'https://example.com/voice.mp3',
        voiceName: 'My Voice',
      };
      const result = await controller.startTraining(body as never);
      expect(voiceTrainingService.startTraining).toHaveBeenCalledWith(body);
      expect(result).toEqual({ jobId: 'job-new', status: 'queued' });
    });

    it('propagates errors from the service', async () => {
      voiceTrainingService.startTraining.mockRejectedValue(
        new Error('Training failed'),
      );
      await expect(
        controller.startTraining({ audioUrl: '', voiceName: '' } as never),
      ).rejects.toThrow('Training failed');
    });
  });

  describe('listJobs', () => {
    it('returns the list of training jobs', async () => {
      const result = await controller.listJobs();
      expect(voiceTrainingService.listJobs).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when no jobs exist', async () => {
      voiceTrainingService.listJobs.mockResolvedValue([]);
      const result = await controller.listJobs();
      expect(result).toEqual([]);
    });
  });

  describe('getJob', () => {
    it('retrieves a specific job by ID', async () => {
      const result = await controller.getJob('job-1');
      expect(voiceTrainingService.getJob).toHaveBeenCalledWith('job-1');
      expect(result).toEqual({ jobId: 'job-1', status: 'training' });
    });

    it('passes the jobId param correctly to the service', async () => {
      await controller.getJob('custom-job-id');
      expect(voiceTrainingService.getJob).toHaveBeenCalledWith('custom-job-id');
    });

    it('propagates service errors', async () => {
      voiceTrainingService.getJob.mockRejectedValue(new Error('Job not found'));
      await expect(controller.getJob('missing')).rejects.toThrow(
        'Job not found',
      );
    });

    it('returns null when job is not found', async () => {
      voiceTrainingService.getJob.mockResolvedValue(null);
      const result = await controller.getJob('ghost-id');
      expect(result).toBeNull();
    });
  });
});
