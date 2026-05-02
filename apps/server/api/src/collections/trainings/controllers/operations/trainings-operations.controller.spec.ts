vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { TrainingsOperationsController } from '@api/collections/trainings/controllers/operations/trainings-operations.controller';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
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
    _id: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439012',
    sources: Array.from(
      { length: 10 },
      (_, i) => `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
    ),
    status: 'completed',
    user: '507f1f77bcf86cd799439011',
  };

  const mockSourceDocs = Array.from({ length: 10 }, (_, i) => ({
    _id: `507f1f77bcf86cd79943${String(i).padStart(4, '0')}`,
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
      .overrideGuard(ClerkGuard)
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

    it('should throw 400 when training is already processing', async () => {
      mockServices.trainingsService.findOne.mockResolvedValueOnce({
        ...mockTraining,
        status: 'processing',
      });

      await expect(
        controller.relaunchTraining(
          {} as unknown as Request,
          mockUser,
          '507f1f77bcf86cd799439014',
        ),
      ).rejects.toThrow();
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
      expect(pipelineArg.where.category).toBe('source');
    });
  });
});
