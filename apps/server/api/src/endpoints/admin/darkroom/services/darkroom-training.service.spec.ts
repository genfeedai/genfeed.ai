vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { ConfigService } from '@api/config/config.service';
import { DarkroomTrainingService } from '@api/endpoints/admin/darkroom/services/darkroom-training.service';
import { LoraStatus, TrainingStage, TrainingStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DarkroomTrainingService', () => {
  let service: DarkroomTrainingService;
  let trainingsService: Record<string, ReturnType<typeof vi.fn>>;
  let personasService: Record<string, ReturnType<typeof vi.fn>>;
  let configService: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: Record<string, ReturnType<typeof vi.fn>>;
  let modelRegistrationService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    trainingsService = {
      findOne: vi.fn(),
      patch: vi.fn().mockResolvedValue({}),
    };

    personasService = {
      findOne: vi.fn().mockResolvedValue({
        _id: { toString: () => 'persona-1' },
        isDeleted: false,
        slug: 'alice',
      }),
      patch: vi.fn().mockResolvedValue({}),
    };

    configService = {
      get: vi.fn().mockReturnValue('http://gpu-images:3000'),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    modelRegistrationService = {
      createFromTraining: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DarkroomTrainingService,
        {
          provide: TrainingsService,
          useValue: trainingsService,
        },
        {
          provide: PersonasService,
          useValue: personasService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
        {
          provide: ModelRegistrationService,
          useValue: modelRegistrationService,
        },
      ],
    }).compile();

    service = module.get<DarkroomTrainingService>(DarkroomTrainingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoTuneHyperparameters', () => {
    it('should return low-resource params for < 10 images', () => {
      const result = service.autoTuneHyperparameters(5);

      expect(result).toEqual({
        batchSize: 1,
        captionDropout: 0.1,
        learningRate: 4e-4,
        rank: 16,
        steps: 1000,
      });
    });

    it('should return medium-low params for 10-14 images', () => {
      const result = service.autoTuneHyperparameters(12);

      expect(result).toEqual({
        batchSize: 1,
        captionDropout: 0.08,
        learningRate: 4e-4,
        rank: 24,
        steps: 1500,
      });
    });

    it('should return medium params for 15-24 images', () => {
      const result = service.autoTuneHyperparameters(20);

      expect(result).toEqual({
        batchSize: 1,
        captionDropout: 0.05,
        learningRate: 4e-4,
        rank: 32,
        steps: 2000,
      });
    });

    it('should return high-resource params for >= 25 images', () => {
      const result = service.autoTuneHyperparameters(50);

      expect(result).toEqual({
        batchSize: 1,
        captionDropout: 0.03,
        learningRate: 4e-4,
        rank: 32,
        steps: 3000,
      });
    });

    it('should return boundary params at exactly 10 images', () => {
      const result = service.autoTuneHyperparameters(10);
      expect(result.rank).toBe(24);
      expect(result.steps).toBe(1500);
    });

    it('should return boundary params at exactly 15 images', () => {
      const result = service.autoTuneHyperparameters(15);
      expect(result.rank).toBe(32);
      expect(result.steps).toBe(2000);
    });

    it('should return boundary params at exactly 25 images', () => {
      const result = service.autoTuneHyperparameters(25);
      expect(result.rank).toBe(32);
      expect(result.steps).toBe(3000);
    });
  });

  describe('updateStage', () => {
    it('should patch training with stage and progress', async () => {
      await service.updateStage('training-1', TrainingStage.PREPROCESSING, 10);

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          progress: 10,
          stage: TrainingStage.PREPROCESSING,
        }),
      );
    });

    it('should set startedAt and PROCESSING status for TRAINING stage', async () => {
      await service.updateStage('training-1', TrainingStage.TRAINING, 30);

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          stage: TrainingStage.TRAINING,
          startedAt: expect.any(Date),
          status: TrainingStatus.PROCESSING,
        }),
      );
    });

    it('should set completedAt and COMPLETED status for COMPLETED stage', async () => {
      await service.updateStage('training-1', TrainingStage.COMPLETED, 100);

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          completedAt: expect.any(Date),
          stage: TrainingStage.COMPLETED,
          status: TrainingStatus.COMPLETED,
        }),
      );
    });

    it('should set completedAt and FAILED status for FAILED stage', async () => {
      await service.updateStage('training-1', TrainingStage.FAILED, 0);

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          completedAt: expect.any(Date),
          stage: TrainingStage.FAILED,
          status: TrainingStatus.FAILED,
        }),
      );
    });

    it('should merge extra fields into update', async () => {
      await service.updateStage('training-1', TrainingStage.FAILED, 0, {
        error: 'GPU timeout',
      });

      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          error: 'GPU timeout',
        }),
      );
    });
  });

  describe('getDatasetInfo', () => {
    it('should call images service GET /datasets/:slug', async () => {
      const mockResponse = {
        data: {
          imageCount: 20,
          images: ['img1.jpg', 'img2.jpg'],
          path: '/datasets/alice',
          slug: 'alice',
        },
      };
      vi.mocked(axios.get).mockResolvedValue(mockResponse);

      const result = await service.getDatasetInfo('alice');

      expect(axios.get).toHaveBeenCalledWith(
        'http://gpu-images:3000/datasets/alice',
        { timeout: 15000 },
      );
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('syncDataset', () => {
    it('should call images service POST /datasets/:slug/sync', async () => {
      vi.mocked(axios.post).mockResolvedValue({ data: {} });

      await service.syncDataset('alice', ['s3://key1', 's3://key2'], 'bucket');

      expect(axios.post).toHaveBeenCalledWith(
        'http://gpu-images:3000/datasets/alice/sync',
        { bucket: 'bucket', s3Keys: ['s3://key1', 's3://key2'] },
        { timeout: 120000 },
      );
    });
  });

  describe('updatePersonaLoraState', () => {
    it('should find persona with organization and isDeleted scoping', async () => {
      await service.updatePersonaLoraState(
        'alice',
        'org-123',
        LoraStatus.READY,
        'lora.safetensors',
      );

      expect(personasService.findOne).toHaveBeenCalledWith({
        isDarkroomCharacter: true,
        isDeleted: false,
        organization: 'org-123',
        slug: 'alice',
      });
    });

    it('should patch persona with loraStatus and loraModelPath', async () => {
      await service.updatePersonaLoraState(
        'alice',
        'org-123',
        LoraStatus.READY,
        'lora.safetensors',
      );

      expect(personasService.patch).toHaveBeenCalledWith('persona-1', {
        loraModelPath: 'lora.safetensors',
        loraStatus: LoraStatus.READY,
      });
    });

    it('should not patch if persona not found', async () => {
      personasService.findOne.mockResolvedValue(null);

      await service.updatePersonaLoraState(
        'unknown',
        'org-123',
        LoraStatus.READY,
      );

      expect(personasService.patch).not.toHaveBeenCalled();
    });

    it('should omit organization from query when organizationId is undefined', async () => {
      await service.updatePersonaLoraState(
        'alice',
        undefined,
        LoraStatus.FAILED,
      );

      expect(personasService.findOne).toHaveBeenCalledWith({
        isDarkroomCharacter: true,
        isDeleted: false,
        slug: 'alice',
      });
    });
  });

  describe('executeTrainingPipeline', () => {
    it('should update persona to FAILED state on pipeline error', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'));

      await service.executeTrainingPipeline({
        baseModel: 'flux',
        learningRate: 4e-4,
        loraName: 'alice_lora',
        loraRank: 32,
        organizationId: 'org-123',
        personaSlug: 'alice',
        steps: 2000,
        trainingId: 'training-1',
        triggerWord: 'alice_lora',
      });

      expect(personasService.findOne).toHaveBeenCalled();
      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          error: 'Network error',
          stage: TrainingStage.FAILED,
        }),
      );
    });

    it('should throw when dataset has 0 images', async () => {
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          imageCount: 0,
          images: [],
          path: '/datasets/alice',
          slug: 'alice',
        },
      });

      await service.executeTrainingPipeline({
        baseModel: 'flux',
        learningRate: 4e-4,
        loraName: 'alice_lora',
        loraRank: 32,
        organizationId: 'org-123',
        personaSlug: 'alice',
        steps: 2000,
        trainingId: 'training-1',
        triggerWord: 'alice_lora',
      });

      // Should have caught the error and updated to FAILED
      expect(trainingsService.patch).toHaveBeenCalledWith(
        'training-1',
        expect.objectContaining({
          stage: TrainingStage.FAILED,
        }),
      );
    });
  });
});
