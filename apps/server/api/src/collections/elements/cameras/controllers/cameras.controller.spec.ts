import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsCamerasController } from '@api/collections/elements/cameras/controllers/cameras.controller';
import { CreateElementCameraDto } from '@api/collections/elements/cameras/dto/create-camera.dto';
import { UpdateElementCameraDto } from '@api/collections/elements/cameras/dto/update-camera.dto';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CameraSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
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
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

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
    brandId: testId('brand'),
    isSuperAdmin: true,
    organizationId: testId('org'),
    userId: testId('user'),
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

  describe('create', () => {
    it('should create a camera for superadmin', async () => {
      const createDto: CreateElementCameraDto = {
        key: 'test-camera',
        label: 'Test Camera',
      } as unknown as CreateElementCameraDto;

      const mockCreatedCamera = {
        id: testId('camera'),
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
      const id = testId('camera');
      const updateDto: UpdateElementCameraDto = {
        label: 'Updated Camera',
      } as unknown as UpdateElementCameraDto;

      const mockExistingCamera = {
        id: id,
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
        { id: id },
        expect.anything(),
      );
      expect(camerasService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if camera not found', async () => {
      const id = testId('camera');
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
      const id = testId('camera');
      const mockCamera = {
        id: id,
        key: 'delete-camera',
        label: 'Camera to Delete',
        userId: mockSuperAdminUser.userId as string,
      };

      camerasService.findOne.mockResolvedValue(mockCamera as never);
      camerasService.remove.mockResolvedValue(mockCamera as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(camerasService.findOne).toHaveBeenCalledWith({
        id: id,
        isDeleted: false,
      });
      expect(camerasService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated cameras', async () => {
      const mockCameras = {
        docs: [
          { id: '1', key: 'camera-1', label: 'Camera 1' },
          { id: '2', key: 'camera-2', label: 'Camera 2' },
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
