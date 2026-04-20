import { ElementsCameraMovementsController } from '@api/collections/elements/camera-movements/controllers/camera-movements.controller';
import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { CameraMovementSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const createBaseQuery = (
  partial: Partial<BaseQueryDto> & Record<string, unknown> = {},
): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 10,
    page: 1,
    pagination: true,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

const asMatchStage = (stage: Record<string, unknown>) =>
  stage as Record<string, unknown> & { $match: Record<string, unknown> };

const asSortStage = (stage: Record<string, unknown>) =>
  stage as Record<string, unknown> & { $sort: Record<string, unknown> };

vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('ElementsCameraMovementsController', () => {
  let controller: ElementsCameraMovementsController;
  let cameraMovementsService: vi.Mocked<ElementsCameraMovementsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockSuperAdminUser = {
    id: 'user-123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      isSuperAdmin: true,
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRegularUser = {
    id: 'user-456',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      isSuperAdmin: false,
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/elements/camera-movements',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsCameraMovementsController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ElementsCameraMovementsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsCameraMovementsController>(
      ElementsCameraMovementsController,
    );
    cameraMovementsService = module.get(ElementsCameraMovementsService);
    loggerService = module.get(LoggerService);

    vi.spyOn(CameraMovementSerializer, 'serialize').mockImplementation(
      (data) => ({ data: data as never }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization filter', () => {
      const query = createBaseQuery();

      const result = controller.buildFindAllPipeline(mockSuperAdminUser, query);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('$match');
      expect(asMatchStage(result[0]).$match).toHaveProperty('isDeleted', false);
      expect(result[1]).toHaveProperty('$sort');
    });

    it('should build pipeline with search filter', () => {
      const query = createBaseQuery({ search: 'pan' });

      const result = controller.buildFindAllPipeline(mockSuperAdminUser, query);

      expect(result.length).toBeGreaterThan(1);
      const searchStage = result.find((stage) => {
        const match = asMatchStage(stage).$match;
        return match?.$or;
      });
      expect(searchStage).toBeDefined();
    });

    it('should build pipeline with custom sort', () => {
      const query = createBaseQuery({ sort: '-label' });

      const result = controller.buildFindAllPipeline(mockSuperAdminUser, query);

      expect(result).toHaveLength(2);
      expect(asSortStage(result[1]).$sort).toBeDefined();
    });

    it('should build pipeline for users with organization', () => {
      const query = createBaseQuery();

      const result = controller.buildFindAllPipeline(mockRegularUser, query);

      expect(asMatchStage(result[0]).$match).toHaveProperty('$or');
    });
  });

  describe('create', () => {
    it('should create a camera movement for superadmin', async () => {
      const createDto: CreateElementCameraMovementDto = {
        key: 'test-movement',
        label: 'Test Camera Movement',
      } as unknown as CreateElementCameraMovementDto;

      const mockCreatedMovement = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
      };

      cameraMovementsService.create.mockResolvedValue(
        mockCreatedMovement as never,
      );

      const result = await controller.create(
        mockRequest,
        mockSuperAdminUser,
        createDto,
      );

      expect(cameraMovementsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a camera movement for superadmin', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementCameraMovementDto = {
        label: 'Updated Camera Movement',
      } as unknown as UpdateElementCameraMovementDto;

      const mockExistingMovement = {
        _id: id,
        key: 'old-movement',
        label: 'Old Movement',
      };

      const mockUpdatedMovement = {
        ...mockExistingMovement,
        ...updateDto,
      };

      cameraMovementsService.findOne.mockResolvedValue(
        mockExistingMovement as never,
      );
      cameraMovementsService.patch.mockResolvedValue(
        mockUpdatedMovement as never,
      );

      const result = await controller.update(
        mockRequest,
        mockSuperAdminUser,
        id,
        updateDto,
      );

      expect(cameraMovementsService.findOne).toHaveBeenCalledWith(
        { _id: id },
        expect.anything(),
      );
      expect(cameraMovementsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if camera movement not found', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementCameraMovementDto = {
        label: 'Updated Camera Movement',
      } as unknown as UpdateElementCameraMovementDto;

      cameraMovementsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockSuperAdminUser, id, updateDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a camera movement for superadmin', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const mockMovement = {
        _id: id,
        key: 'delete-movement',
        label: 'Movement to Delete',
        user: mockSuperAdminUser.publicMetadata.user as string,
      };

      cameraMovementsService.findOne.mockResolvedValue(mockMovement as never);
      cameraMovementsService.remove.mockResolvedValue(mockMovement as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(cameraMovementsService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(cameraMovementsService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated camera movements', async () => {
      const mockMovements = {
        docs: [
          { _id: '1', key: 'movement-1', label: 'Movement 1' },
          { _id: '2', key: 'movement-2', label: 'Movement 2' },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 2,
        totalPages: 1,
      };

      cameraMovementsService.findAll.mockResolvedValue(mockMovements as never);

      const query = createBaseQuery();

      const result = await controller.findAll(
        mockRequest,
        mockSuperAdminUser,
        query,
      );

      expect(cameraMovementsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle empty results', async () => {
      const mockMovements = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 0,
      };

      cameraMovementsService.findAll.mockResolvedValue(mockMovements as never);

      const query = createBaseQuery();

      const result = await controller.findAll(
        mockRequest,
        mockSuperAdminUser,
        query,
      );

      expect(result).toBeDefined();
    });
  });
});
