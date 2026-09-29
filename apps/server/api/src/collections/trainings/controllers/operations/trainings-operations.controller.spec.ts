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
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrainingsOperationsController', () => {
  let controller: TrainingsOperationsController;
  let trainingsService: TrainingsService;

  const brandId = testId('brand');
  const organizationId = testId('org');
  const userId = testId('user');
  const trainingId = testId('training');
  const missingTrainingId = testId('training', 2);

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockTraining = {
    brandId,
    config: {
      category: 'style',
      model: 'replicate/custom-model',
      provider: 'replicate',
      seed: 42,
      steps: 1200,
      trigger: 'MYTOK',
    },
    id: trainingId,
    model: 'replicate/custom-model',
    organizationId,
    sources: Array.from(
      { length: 10 },
      (_, i) => `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
    ),
    stage: 'READY',
    userId,
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
      patchAll: vi.fn().mockResolvedValue({ modifiedCount: 10 }),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: {
      findAll: vi.fn().mockResolvedValue({
        docs: [{ id: 'metadata-1' }, { id: 'metadata-2' }],
      }),
      patch: vi.fn(),
    },
    trainingsService: {
      createTrainingZip: vi
        .fn()
        .mockResolvedValue('https://s3.amazonaws.com/bucket/training.zip'),
      findOne: vi.fn().mockResolvedValue(mockTraining),
      launchTraining: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn().mockResolvedValue(mockTraining),
      relaunchTrainingWithSources: vi.fn().mockResolvedValue({
        sourceImages: mockSourceDocs,
        training: mockTraining,
      }),
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
        trainingId,
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
          missingTrainingId,
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
          trainingId,
        ),
      ).rejects.toThrow();
      expect(
        mockServices.trainingsService.relaunchTrainingWithSources,
      ).not.toHaveBeenCalled();
    });

    it('delegates relaunch construction to trainingsService.relaunchTrainingWithSources', async () => {
      await controller.relaunchTraining(
        {} as unknown as Request,
        mockUser,
        trainingId,
      );

      expect(
        mockServices.trainingsService.relaunchTrainingWithSources,
      ).toHaveBeenCalledWith(
        mockTraining,
        expect.objectContaining({
          brandId: mockUser.brandId,
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
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
          trainingId,
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

    it('wraps a service error into a 500 HttpException when relaunchTrainingWithSources rejects', async () => {
      mockServices.trainingsService.relaunchTrainingWithSources.mockRejectedValueOnce(
        new Error('fewer than 10 source images found'),
      );

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          trainingId,
        ),
      ).rejects.toThrow();
    });
  });

  describe('getTrainingImages', () => {
    it('filters ingredients by canonical metadataId values', async () => {
      await controller.getTrainingImages(
        {} as unknown as Request,
        mockUser,
        mockTraining.id,
        {},
      );

      expect(mockServices.metadataService.findAll).toHaveBeenCalledWith(
        {
          where: {
            model: mockTraining.model,
          },
        },
        { pagination: false },
      );

      const ingredientQuery =
        mockServices.ingredientsService.findAll.mock.calls.at(-1)?.[0];
      expect(ingredientQuery.where).toMatchObject({
        metadataId: { in: ['metadata-1', 'metadata-2'] },
      });
      expect(ingredientQuery.where).not.toHaveProperty('metadata');
    });
  });
});
