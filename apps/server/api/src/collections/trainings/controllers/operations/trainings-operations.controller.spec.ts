vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { TrainingsOperationsController } from '@api/collections/trainings/controllers/operations/trainings-operations.controller';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrainingsOperationsController', () => {
  let controller: TrainingsOperationsController;
  let trainingsService: TrainingsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockTraining = {
    brandId: '507f1f77bcf86cd799439013',
    config: {
      category: 'style',
      model: 'replicate/custom-model',
      provider: 'replicate',
      seed: 42,
      steps: 1200,
      trigger: 'MYTOK',
    },
    id: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439012',
    sources: Array.from(
      { length: 10 },
      (_, i) => `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
    ),
    stage: 'READY',
    user: '507f1f77bcf86cd799439011',
  };

  const mockSourceDocs = Array.from({ length: 10 }, (_, i) => ({
    id: `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
    metadata: { extension: 'jpg' },
  }));

  const mockServices = {
    configService: {
      get: vi.fn().mockReturnValue('replicate/fast-flux-trainer'),
    },
    ingredientsService: {
      findAll: vi.fn().mockResolvedValue({
        docs: mockSourceDocs,
        total: 10,
      }),
      patch: vi.fn().mockResolvedValue({}),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    trainingsService: {
      create: vi.fn().mockResolvedValue(mockTraining),
      createTrainingZip: vi
        .fn()
        .mockResolvedValue('https://s3.amazonaws.com/bucket/training.zip'),
      findOne: vi.fn().mockResolvedValue(mockTraining),
      launchTraining: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue(mockTraining),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingsOperationsController],
      providers: [
        { provide: ConfigService, useValue: mockServices.configService },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        {
          provide: TrainingsService,
          useValue: mockServices.trainingsService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TrainingsOperationsController>(
      TrainingsOperationsController,
    );
    trainingsService = module.get<TrainingsService>(TrainingsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('relaunchTraining', () => {
    it('should relaunch a training successfully', async () => {
      const result = await controller.relaunchTraining(
        {} as unknown as Request,
        mockUser,
        '507f1f77bcf86cd799439014',
      );

      expect(trainingsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw 404 when training not found', async () => {
      mockServices.trainingsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          '507f191e810c19729de860ee'.toString(),
        ),
      ).rejects.toThrow();
    });

    it('should throw 400 when training stage is already in progress', async () => {
      mockServices.trainingsService.findOne.mockResolvedValueOnce({
        ...mockTraining,
        stage: 'TRAINING',
      });

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          '507f1f77bcf86cd799439014',
        ),
      ).rejects.toThrow();
      expect(mockServices.trainingsService.create).not.toHaveBeenCalled();
    });

    it('builds the relaunch config from the training nested config, not top-level fields', async () => {
      await controller.relaunchTraining(
        {} as unknown as Request,
        mockUser,
        '507f1f77bcf86cd799439014',
      );

      expect(mockServices.trainingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: '507f1f77bcf86cd799439013',
          config: expect.objectContaining({
            category: 'style',
            model: 'replicate/custom-model',
            provider: 'replicate',
            seed: 42,
            steps: 1200,
            trigger: 'MYTOK',
          }),
        }),
      );
    });

    it('marks the training FAILED via the `stage` column when zip creation fails', async () => {
      mockServices.trainingsService.createTrainingZip.mockRejectedValueOnce(
        new Error('zip boom'),
      );

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          '507f1f77bcf86cd799439014',
        ),
      ).rejects.toThrow();

      expect(mockServices.trainingsService.patch).toHaveBeenCalledWith(
        mockTraining.id,
        { stage: 'FAILED' },
      );
      const patchPayload =
        mockServices.trainingsService.patch.mock.calls.at(-1)?.[1];
      expect(patchPayload).not.toHaveProperty('status');
    });

    it('should throw when fewer than 10 source images found', async () => {
      mockServices.ingredientsService.findAll.mockResolvedValueOnce({
        docs: Array.from({ length: 5 }, () => ({
          _id: '507f191e810c19729de860ee',
          metadata: { extension: 'jpg' },
        })),
        total: 5,
      });

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          '507f1f77bcf86cd799439014',
        ),
      ).rejects.toThrow();
    });

    it('should fetch ingredients with source category filter', async () => {
      await controller.relaunchTraining(
        {} as unknown as Request,
        mockUser,
        '507f1f77bcf86cd799439014',
      );

      const pipelineArg = mockServices.ingredientsService.findAll.mock
        .calls[0][0] as { where: Record<string, unknown> };
      expect(pipelineArg.where.category).toBe('SOURCE');
    });
  });
});
