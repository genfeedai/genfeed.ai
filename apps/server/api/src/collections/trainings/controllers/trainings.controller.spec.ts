import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
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
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { testId } from '@helpers/testing/test-id.helper';
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

  const fixtureId = testId('fixture');

  const mockUser = {
    id: 'user-123',
    brandId: fixtureId,
    organizationId: fixtureId,
    userId: fixtureId,
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
            createTrainingWithSources: vi.fn(),
            createTrainingZip: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            launchTraining: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
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
            id: 'training-1',
            category: 'subject',
            isActive: true,
            isDeleted: false,
            label: 'Training 1',
            model: 'replicate/fast-flux-trainer:test',
            organizationId: mockUser.organizationId as string,
            sources: [],
            steps: 1000,
            trigger: 'TOK1',
            userId: mockUser.userId as string,
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
    const createDto: CreateTrainingDto = {
      label: 'New Training',
      sources: Array(10)
        .fill(null)
        .map(() => fixtureId),
      steps: 1000,
      trigger: 'NEWTOK',
      type: 'subject',
    } as unknown as CreateTrainingDto;

    const mockSourceImages = [{ id: 'img-1', metadata: { extension: 'jpg' } }];
    const mockTraining = {
      id: fixtureId,
      label: 'New Training',
    };

    it('delegates training creation to trainingsService.createTrainingWithSources', async () => {
      trainingsService.createTrainingWithSources.mockResolvedValueOnce({
        sourceImages: mockSourceImages,
        training: mockTraining,
      } as never);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(trainingsService.createTrainingWithSources).toHaveBeenCalledWith(
        createDto,
        expect.objectContaining({
          brandId: mockUser.brandId,
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        }),
      );
      expect(result).toBeDefined();
    });

    it('wraps a service error into a 500 HttpException', async () => {
      trainingsService.createTrainingWithSources.mockRejectedValueOnce(
        new Error('less than 10 sources'),
      );

      await expect(
        controller.create(mockRequest, mockUser, createDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findOne', () => {
    it('accepts a canonical cuid id and returns the training', async () => {
      const cuid = testId('training');
      trainingsService.findOne.mockResolvedValueOnce({ id: cuid } as never);

      const result = await controller.findOne(mockRequest, mockUser, cuid);

      expect(trainingsService.findOne).toHaveBeenCalledWith({
        id: cuid,
        organizationId: mockUser.organizationId,
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
      id: testId('training', 2),
      userId: testId('user', 2),
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
        userId: mockUser.userId,
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });

    it('should return true when user organization owns the entity', () => {
      const entity = {
        organizationId: mockUser.organizationId,
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });

    it('should return false when user does not own the entity', () => {
      const entity = {
        organizationId: testId('org', 2),
        userId: testId('user', 3),
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(false);
    });

    it('should prefer the canonical scalar owner over a populated relation', () => {
      const entity = {
        user: { id: 'different-user' },
        userId: mockUser.userId,
      };

      const result = controller.canUserModifyEntity(mockUser, entity);
      expect(result).toBe(true);
    });
  });
});
