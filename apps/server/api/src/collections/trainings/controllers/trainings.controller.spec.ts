import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrainingsController } from '@api/collections/trainings/controllers/trainings.controller';
import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import type { TrainingsQueryDto } from '@api/collections/trainings/dto/trainings-query.dto';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

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
      brand: '507f191e810c19729de860ee'.toString(),
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IAuthPublicMetadata,
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
            patchAll: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
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
      .overrideGuard(BetterAuthGuard)
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
            organization: mockUser.publicMetadata.organization as string,
            sources: [],
            steps: 1000,
            trigger: 'TOK1',
            user: mockUser.publicMetadata.user as string,
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

    it('should map status=completed to stage=READY in the filter', async () => {
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

      const query = createTrainingsQuery({ status: ['completed'] });
      await controller.findAll(mockRequest, mockUser, query);

      const findAllQuery = controller.buildFindAllQuery(mockUser, query);
      // Training has no `status` column — app-vocab is mapped to `stage`.
      expect(findAllQuery.where?.status).toBeUndefined();
      expect(findAllQuery.where?.stage).toEqual('READY');
    });

    it('should apply sorting when sort parameter is provided', () => {
      const query = createTrainingsQuery({ sort: 'createdAt: -1' });

      const findAllQuery = controller.buildFindAllQuery(mockUser, query);
      expect(findAllQuery.orderBy).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a new training successfully', async () => {
      const createDto: CreateTrainingDto = {
        label: 'New Training',
        sources: Array(10)
          .fill(null)
          .map(() => '507f191e810c19729de860ee'.toString()),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
      } as unknown as CreateTrainingDto;

      const mockSources = Array(10)
        .fill(null)
        .map(() => ({
          id: '507f191e810c19729de860ee',
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        }));

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: mockSources,
      } as never);

      const mockTraining = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
        status: IngredientStatus.PROCESSING,
        user: '507f191e810c19729de860ee',
      };

      trainingsService.create.mockResolvedValueOnce(mockTraining as never);
      trainingsService.createTrainingZip.mockResolvedValueOnce(
        'https://test.com/training.zip',
      );
      trainingsService.launchTraining.mockResolvedValueOnce('training-123');

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(ingredientsService.findAll).toHaveBeenCalled();
      expect(trainingsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: mockUser.publicMetadata.brand,
          config: expect.objectContaining({
            model: 'default-trainer-model',
            status: IngredientStatus.PROCESSING,
            steps: 1000,
            trigger: 'NEWTOK',
          }),
          label: 'New Training',
          organizationId: mockUser.publicMetadata.organization,
          sources: {
            connect: expect.arrayContaining([
              { id: '507f191e810c19729de860ee' },
            ]),
          },
          userId: mockUser.publicMetadata.user,
        }),
      );
      expect(result).toBeDefined();
    });

    it('nests the id filter and the ownership filter under AND so neither is dropped', async () => {
      const createDto = {
        label: 'New Training',
        sources: Array.from({ length: 12 }, (_, i) => `source-${i}`),
        steps: 1000,
        trigger: 'NEWTOK',
      } as unknown as CreateTrainingDto;

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: Array.from({ length: 12 }, (_, i) => ({
          id: `source-${i}`,
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        })),
      } as never);
      trainingsService.create.mockResolvedValueOnce({
        id: 'training-1',
      } as never);

      await controller.create(mockRequest, mockUser, createDto);

      const [aggregate] = ingredientsService.findAll.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      // A sibling `OR` key would overwrite the `_id` expansion in
      // `processSearchParams` and silently match every image the caller owns.
      expect(aggregate.where).not.toHaveProperty('OR');
      expect(aggregate.where.AND).toEqual([
        { _id: { in: createDto.sources } },
        {
          OR: [
            { user: mockUser.publicMetadata.user },
            { organization: mockUser.publicMetadata.organization },
          ],
        },
      ]);
    });

    it('marks every source image with one bounded tenant-scoped bulk update', async () => {
      const sourceIds = Array.from({ length: 12 }, (_, i) => `source-${i}`);
      const createDto = {
        label: 'New Training',
        sources: sourceIds,
        steps: 1000,
        trigger: 'NEWTOK',
      } as unknown as CreateTrainingDto;

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: sourceIds.map((id) => ({
          id,
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        })),
      } as never);
      trainingsService.create.mockResolvedValueOnce({
        id: 'training-1',
      } as never);

      await controller.create(mockRequest, mockUser, createDto);

      // One query regardless of source count — never one UPDATE per row.
      expect(ingredientsService.patchAll).toHaveBeenCalledTimes(1);
      expect(ingredientsService.patch).not.toHaveBeenCalled();
      expect(ingredientsService.patchAll).toHaveBeenCalledWith(
        {
          id: { in: sourceIds },
          OR: [
            { userId: mockUser.publicMetadata.user },
            { organizationId: mockUser.publicMetadata.organization },
          ],
        },
        {
          category: 'SOURCE',
          // Scalar FK — the legacy `training` relation alias never resolves.
          trainingId: 'training-1',
        },
      );
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
          .map(() => '507f191e810c19729de860ee'.toString()),
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
          .map(() => '507f191e810c19729de860ee'.toString()),
        steps: 1000,
        trigger: 'NEWTOK',
        type: 'subject',
      } as unknown as CreateTrainingDto;

      const mockSources = Array(10)
        .fill(null)
        .map(() => ({
          id: '507f191e810c19729de860ee',
          category: IngredientCategory.IMAGE,
          metadata: { extension: 'jpg' },
        }));

      ingredientsService.findAll.mockResolvedValueOnce({
        docs: mockSources,
      } as never);

      modelsService.findOne.mockResolvedValueOnce({
        key: `${MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER}:version123`,
      } as never);

      const mockTraining = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
        status: IngredientStatus.PROCESSING,
        user: '507f191e810c19729de860ee',
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

  describe('findOne', () => {
    it('accepts a cuid id (not just a Mongo ObjectId) and returns the training', async () => {
      const cuid = 'clz1a2b3c4d5e6f7g8h9i0j1k';
      trainingsService.findOne.mockResolvedValueOnce({ id: cuid } as never);

      const result = await controller.findOne(mockRequest, mockUser, cuid);

      expect(trainingsService.findOne).toHaveBeenCalledWith({
        _id: cuid,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization,
      });
      expect(result).toBeDefined();
    });

    it('returns 404 for a genuinely malformed id without hitting the service', async () => {
      await expect(
        controller.findOne(mockRequest, mockUser, 'not a valid id!!'),
      ).rejects.toThrow(HttpException);
      expect(trainingsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('processAndLaunchTrainingAsync (failure handling)', () => {
    const training = {
      id: '507f191e810c19729de860ee',
      user: '507f191e810c19729de860ee',
    } as never;
    const sourceImages = [
      { id: 'img-1', metadata: { extension: 'jpg' } },
    ] as never;

    const invokeFailurePath = (controllerRef: TrainingsController) =>
      (
        controllerRef as unknown as {
          processAndLaunchTrainingAsync: (
            t: unknown,
            s: unknown,
          ) => Promise<void>;
        }
      ).processAndLaunchTrainingAsync(training, sourceImages);

    it('marks the training FAILED via the `stage` column when zip creation fails', async () => {
      trainingsService.createTrainingZip.mockRejectedValueOnce(
        new Error('zip boom'),
      );

      await invokeFailurePath(controller);

      expect(trainingsService.patch).toHaveBeenCalledWith(training.id, {
        stage: 'FAILED',
      });
      const patchPayload = trainingsService.patch.mock.calls[0]?.[1];
      expect(patchPayload).not.toHaveProperty('status');
    });

    it('marks the training FAILED via the `stage` column when launch fails', async () => {
      trainingsService.createTrainingZip.mockResolvedValueOnce(
        'https://test.com/training.zip',
      );
      trainingsService.launchTraining.mockRejectedValueOnce(
        new Error('launch boom'),
      );

      await invokeFailurePath(controller);

      expect(trainingsService.patch).toHaveBeenCalledWith(training.id, {
        stage: 'FAILED',
      });
      const patchPayload = trainingsService.patch.mock.calls.at(-1)?.[1];
      expect(patchPayload).not.toHaveProperty('status');
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
        organization: '507f191e810c19729de860ff'.toString(),
        user: '507f191e810c19729de860aa'.toString(),
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(false);
    });

    it('should handle ObjectId instances correctly', () => {
      const entity = {
        user: { id: mockUser.publicMetadata.user },
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });
  });
});
