import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import { TrainingEntity } from '@api/collections/trainings/entities/training.entity';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import {
  IngredientCategory,
  IngredientStatus,
  ModelKey,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

const createTrainingsQuery = (
  partial: Partial<TrainingsQueryDto> = {},
): TrainingsQueryDto =>
  ({
    isDeleted: false,
    limit: 20,
    page: 1,
    pagination: true,
    ...partial,
  }) as TrainingsQueryDto;

const asMatchStage = (stage: PipelineStage) =>
  stage as PipelineStage.Match & { $match: Record<string, unknown> };

const asSortStage = (stage: PipelineStage) =>
  stage as PipelineStage.Sort & { $sort: Record<string, unknown> };

vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('TrainingsController', () => {
  let controller: TrainingsController;
  let trainingsService: vi.Mocked<TrainingsService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let modelsService: vi.Mocked<ModelsService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/trainings',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingsController],
      providers: [
        {
          provide: TrainingsService,
          useValue: {
            create: vi.fn(),
            createTrainingZip: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            launchTraining: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findAll: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'REPLICATE_MODELS_TRAINER') {
                return 'default-trainer-model';
              }
              return null;
            }),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn(),
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
          provide: NotificationsPublisherService,
          useValue: {
            publishTrainingStatus: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: vi
          .fn()
          .mockImplementation((_context, next) => next.handle()),
      })
      .compile();

    controller = module.get<TrainingsController>(TrainingsController);
    trainingsService = module.get(TrainingsService);
    ingredientsService = module.get(IngredientsService);
    modelsService = module.get(ModelsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated trainings', async () => {
      const mockTrainings = {
        docs: [
          {
            _id: '1',
            category: 'subject',
            isActive: true,
            isDeleted: false,
            label: 'Training 1',
            model: 'replicate/fast-flux-trainer:test',
            organization: new Types.ObjectId(
              mockUser.publicMetadata.organization as string,
            ),
            sources: [],
            steps: 1000,
            trigger: 'TOK1',
            user: new Types.ObjectId(mockUser.publicMetadata.user as string),
          },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 1,
        totalPages: 1,
      };

      trainingsService.findAll.mockResolvedValueOnce(
        mockTrainings as unknown as AggregatePaginateResult<TrainingDocument>,
      );

      const query = createTrainingsQuery();
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(trainingsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should filter by status when provided', async () => {
      const mockTrainings = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 1,
      };

      trainingsService.findAll.mockResolvedValueOnce(
        mockTrainings as unknown as AggregatePaginateResult<TrainingDocument>,
      );

      const query = createTrainingsQuery({
        status: [IngredientStatus.GENERATED] as unknown as IngredientStatus[],
      });
      await controller.findAll(mockRequest, mockUser, query);

      const pipeline = controller.buildFindAllPipeline(mockUser, query);
      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.status).toEqual(IngredientStatus.GENERATED);
    });

    it('should apply sorting when sort parameter is provided', () => {
      const query = createTrainingsQuery({ sort: 'createdAt: -1' });

      const pipeline = controller.buildFindAllPipeline(mockUser, query);
      const sortStage = asSortStage(pipeline[pipeline.length - 1]);
      expect(sortStage.$sort).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new training successfully', async () => {
      const createDto: CreateTrainingDto = {
        label: 'New Training',
        sources: Array(10)
          .fill(null)
          .map(() => new Types.ObjectId().toString()),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
      } as unknown as CreateTrainingDto;

      const mockSources = Array(10)
        .fill(null)
        .map(() => ({
          _id: new Types.ObjectId(),
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        }));

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: mockSources,
      } as never);

      const mockTraining = {
        _id: new Types.ObjectId(),
        ...createDto,
        status: IngredientStatus.PROCESSING,
        user: new Types.ObjectId(),
      };

      trainingsService.create.mockResolvedValueOnce(mockTraining as never);
      trainingsService.createTrainingZip.mockResolvedValueOnce(
        'https://test.com/training.zip',
      );
      trainingsService.launchTraining.mockResolvedValueOnce('training-123');

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(ingredientsService.findAll).toHaveBeenCalled();
      expect(trainingsService.create).toHaveBeenCalledWith(
        expect.any(TrainingEntity),
      );
      expect(result).toBeDefined();
    });

    it('should throw error when less than 10 sources provided', async () => {
      const createDto: CreateTrainingDto = {
        label: 'New Training',
        sources: ['source1', 'source2'],
        trigger: 'NEWTOK',
      } as unknown as CreateTrainingDto;

      await expect(
        controller.create(mockRequest, mockUser, createDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error when source images not found', async () => {
      const createDto: CreateTrainingDto = {
        label: 'New Training',
        sources: Array(10)
          .fill(null)
          .map(() => new Types.ObjectId().toString()),
        trigger: 'NEWTOK',
      } as unknown as CreateTrainingDto;

      ingredientsService.findAll.mockResolvedValueOnce({ docs: [] } as never);

      await expect(
        controller.create(mockRequest, mockUser, createDto),
      ).rejects.toThrow(HttpException);
    });

    it('should use default model when not provided', async () => {
      const createDto: CreateTrainingDto = {
        label: 'New Training',
        sources: Array(10)
          .fill(null)
          .map(() => new Types.ObjectId().toString()),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
      } as unknown as CreateTrainingDto;

      const mockSources = Array(10)
        .fill(null)
        .map(() => ({
          _id: new Types.ObjectId(),
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        }));

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: mockSources,
      } as never);

      modelsService.findOne.mockResolvedValueOnce({
        key: `${ModelKey.REPLICATE_FAST_FLUX_TRAINER}:version123`,
      } as never);

      const mockTraining = {
        _id: new Types.ObjectId(),
        ...createDto,
        status: IngredientStatus.PROCESSING,
        user: new Types.ObjectId(),
      };

      trainingsService.create.mockResolvedValueOnce(mockTraining as never);
      trainingsService.createTrainingZip.mockResolvedValueOnce(
        'https://test.com/training.zip',
      );
      trainingsService.launchTraining.mockResolvedValueOnce('training-123');

      await controller.create(mockRequest, mockUser, createDto);

      expect(modelsService.findOne).toHaveBeenCalled();
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when user owns the entity', () => {
      const entity = {
        user: mockUser.publicMetadata.user,
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });

    it('should return true when user organization owns the entity', () => {
      const entity = {
        organization: mockUser.publicMetadata.organization,
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });

    it('should return false when user does not own the entity', () => {
      const entity = {
        organization: new Types.ObjectId().toString(),
        user: new Types.ObjectId().toString(),
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(false);
    });

    it('should handle ObjectId instances correctly', () => {
      const entity = {
        user: { _id: mockUser.publicMetadata.user },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with user and organization filter', () => {
      const query = createTrainingsQuery();
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline.length).toBeGreaterThanOrEqual(2);
      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.$or).toBeDefined();
      expect(matchStage.$match.isDeleted).toBe(false);
    });

    it('should include status filter when provided', () => {
      const query = createTrainingsQuery({
        status: [IngredientStatus.GENERATED] as unknown as IngredientStatus[],
      });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.status).toEqual(IngredientStatus.GENERATED);
    });

    it('should handle isDeleted parameter', () => {
      const query = createTrainingsQuery({ isDeleted: true });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.isDeleted).toBe(true);
    });
  });
});
