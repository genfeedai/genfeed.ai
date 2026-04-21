import { ElementsCamerasController } from '@api/collections/elements/cameras/controllers/cameras.controller';
import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { CameraSerializer } from '@genfeedai/serializers';
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
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('ElementsCamerasController', () => {
  let controller: ElementsCamerasController;
  let camerasService: vi.Mocked<ElementsCamerasService>;
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
    originalUrl: '/api/cameras',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsCamerasController],
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
          provide: ElementsCamerasService,
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

    controller = module.get<ElementsCamerasController>(
      ElementsCamerasController,
    );
    camerasService = module.get(ElementsCamerasService);
    loggerService = module.get(LoggerService);

    vi.spyOn(CameraSerializer, 'serialize').mockImplementation((data) => ({
      data: data as never,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with isDeleted filter', () => {
      const query = createBaseQuery();

      const result = controller.buildFindAllPipeline(mockSuperAdminUser, query);

      expect(result).toHaveLength(2);
      expect(asMatchStage(result[0]).$match).toHaveProperty('isDeleted', false);
      expect(asSortStage(result[1]).$sort).toBeDefined();
    });

    it('should build pipeline with custom sort', () => {
      const query = createBaseQuery({ sort: '-label' });

      const result = controller.buildFindAllPipeline(mockSuperAdminUser, query);

      expect(result).toHaveLength(2);
      expect(asSortStage(result[1]).$sort).toBeDefined();
    });

    it('should build pipeline for regular users with $or filter', () => {
      const query = createBaseQuery();

      const result = controller.buildFindAllPipeline(mockRegularUser, query);

      expect(asMatchStage(result[0]).$match).toHaveProperty('isDeleted', false);
      expect(asMatchStage(result[0]).$match).toHaveProperty('$or');
    });
  });

  describe('create', () => {
    it('should create a camera for superadmin', async () => {
      const createDto: CreateElementCameraDto = {
        key: 'test-camera',
        label: 'Test Camera',
      } as unknown as CreateElementCameraDto;

      const mockCreatedCamera = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
      };

      camerasService.create.mockResolvedValue(mockCreatedCamera as never);

      const result = await controller.create(
        mockRequest,
        mockSuperAdminUser,
        createDto,
      );

      expect(camerasService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a camera for superadmin', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementCameraDto = {
        label: 'Updated Camera',
      } as unknown as UpdateElementCameraDto;

      const mockExistingCamera = {
        _id: id,
        key: 'old-camera',
        label: 'Old Camera',
      };

      const mockUpdatedCamera = {
        ...mockExistingCamera,
        ...updateDto,
      };

      camerasService.findOne.mockResolvedValue(mockExistingCamera as never);
      camerasService.patch.mockResolvedValue(mockUpdatedCamera as never);

      const result = await controller.update(
        mockRequest,
        mockSuperAdminUser,
        id,
        updateDto,
      );

      expect(camerasService.findOne).toHaveBeenCalledWith(
        { _id: id },
        expect.anything(),
      );
      expect(camerasService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if camera not found', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementCameraDto = {
        label: 'Updated Camera',
      } as unknown as UpdateElementCameraDto;

      camerasService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockSuperAdminUser, id, updateDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a camera for superadmin', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const mockCamera = {
        _id: id,
        key: 'delete-camera',
        label: 'Camera to Delete',
        user: mockSuperAdminUser.publicMetadata.user as string,
      };

      camerasService.findOne.mockResolvedValue(mockCamera as never);
      camerasService.remove.mockResolvedValue(mockCamera as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(camerasService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(camerasService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated cameras', async () => {
      const mockCameras = {
        docs: [
          { _id: '1', key: 'camera-1', label: 'Camera 1' },
          { _id: '2', key: 'camera-2', label: 'Camera 2' },
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

      camerasService.findAll.mockResolvedValue(mockCameras as never);

      const query = createBaseQuery();

      const result = await controller.findAll(
        mockRequest,
        mockSuperAdminUser,
        query,
      );

      expect(camerasService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle empty results', async () => {
      const mockCameras = {
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

      camerasService.findAll.mockResolvedValue(mockCameras as never);

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
