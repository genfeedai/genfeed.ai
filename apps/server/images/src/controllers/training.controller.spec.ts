import type { TrainingRequest } from '@images/interfaces/training.interfaces';
import { TrainingService } from '@images/services/training.service';
import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './training.controller';

vi.mock('@images/services/training.service');

describe('TrainingController', () => {
  let controller: TrainingController;
  let trainingService: {
    startTraining: ReturnType<typeof vi.fn>;
    listTrainingJobs: ReturnType<typeof vi.fn>;
    getTrainingJob: ReturnType<typeof vi.fn>;
  };

  const mockTrainingJob = {
    createdAt: '2026-01-01T00:00:00.000Z',
    jobId: 'job-abc-123',
    status: 'queued',
    type: 'lora',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [
        {
          provide: TrainingService,
          useValue: {
            getTrainingJob: vi.fn().mockResolvedValue(mockTrainingJob),
            listTrainingJobs: vi.fn().mockResolvedValue([mockTrainingJob]),
            startTraining: vi.fn().mockResolvedValue(mockTrainingJob),
          },
        },
      ],
    }).compile();

    controller = module.get(TrainingController);
    trainingService = module.get(TrainingService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('startTraining()', () => {
    it('delegates to trainingService.startTraining with request body', async () => {
      const body: TrainingRequest = {
        imageUrls: ['https://example.com/img.jpg'],
        instancePrompt: 'a photo of sks person',
        triggerWord: 'sks',
      } as TrainingRequest;
      await controller.startTraining(body);
      expect(trainingService.startTraining).toHaveBeenCalledWith(body);
    });

    it('returns the job from trainingService', async () => {
      const result = await controller.startTraining({} as TrainingRequest);
      expect(result).toEqual(mockTrainingJob);
    });

    it('propagates service errors', async () => {
      trainingService.startTraining.mockRejectedValue(
        new Error('training failed'),
      );
      await expect(
        controller.startTraining({} as TrainingRequest),
      ).rejects.toThrow('training failed');
    });
  });

  describe('listTrainingJobs()', () => {
    it('delegates to trainingService.listTrainingJobs', async () => {
      await controller.listTrainingJobs();
      expect(trainingService.listTrainingJobs).toHaveBeenCalledWith();
    });

    it('returns the list from trainingService', async () => {
      const result = await controller.listTrainingJobs();
      expect(result).toEqual([mockTrainingJob]);
    });

    it('returns empty array when no jobs exist', async () => {
      trainingService.listTrainingJobs.mockResolvedValue([]);
      const result = await controller.listTrainingJobs();
      expect(result).toEqual([]);
    });
  });

  describe('getTrainingJob()', () => {
    it('passes jobId to trainingService.getTrainingJob', async () => {
      await controller.getTrainingJob('job-abc-123');
      expect(trainingService.getTrainingJob).toHaveBeenCalledWith(
        'job-abc-123',
      );
    });

    it('returns the job from trainingService', async () => {
      const result = await controller.getTrainingJob('job-abc-123');
      expect(result).toEqual(mockTrainingJob);
    });

    it('returns null when job is not found', async () => {
      trainingService.getTrainingJob.mockResolvedValue(null);
      const result = await controller.getTrainingJob('missing-id');
      expect(result).toBeNull();
    });

    it('propagates service errors', async () => {
      trainingService.getTrainingJob.mockRejectedValue(new Error('db error'));
      await expect(controller.getTrainingJob('job-1')).rejects.toThrow(
        'db error',
      );
    });
  });
});
