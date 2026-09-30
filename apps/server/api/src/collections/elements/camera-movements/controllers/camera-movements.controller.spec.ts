import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsCameraMovementsController } from '@api/collections/elements/camera-movements/controllers/camera-movements.controller';
import { CreateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/create-camera-movement.dto';
import { UpdateElementCameraMovementDto } from '@api/collections/elements/camera-movements/dto/update-camera-movement.dto';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

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

  const mockSuperAdminUser = {
    id: 'user-123',
    brandId: 'cmbrand000000000000000001',
    isSuperAdmin: true,
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
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
            supportsField: vi.fn((field: string) => field === 'organizationId'),
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

  describe('create', () => {
    it('should create a camera movement for superadmin', async () => {
      const createDto: CreateElementCameraMovementDto = {
        key: 'test-movement',
        label: 'Test Camera Movement',
      } as unknown as CreateElementCameraMovementDto;

      const mockCreatedMovement = {
        id: 'cmcameramovement000000000001',
        ...createDto,
        organizationId: mockSuperAdminUser.organizationId,
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
      const id = 'cmcameramovement000000000001';
      const updateDto: UpdateElementCameraMovementDto = {
        label: 'Updated Camera Movement',
      } as unknown as UpdateElementCameraMovementDto;

      const mockExistingMovement = {
        id,
        key: 'old-movement',
        label: 'Old Movement',
        organizationId: mockSuperAdminUser.organizationId,
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
        { id },
        expect.anything(),
      );
      expect(cameraMovementsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if camera movement not found', async () => {
      const id = 'cmcameramovement000000000001';
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
      const id = 'cmcameramovement000000000001';
      const mockMovement = {
        id,
        key: 'delete-movement',
        label: 'Movement to Delete',
        organizationId: mockSuperAdminUser.organizationId,
      };

      cameraMovementsService.findOne.mockResolvedValue(mockMovement as never);
      cameraMovementsService.remove.mockResolvedValue(mockMovement as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(cameraMovementsService.findOne).toHaveBeenCalledWith({
        id,
        isDeleted: false,
      });
      expect(cameraMovementsService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated camera movements', async () => {
      const mockMovements = {
        docs: [
          {
            id: 'cmcameramovement000000000001',
            key: 'movement-1',
            label: 'Movement 1',
          },
          {
            id: 'cmcameramovement000000000002',
            key: 'movement-2',
            label: 'Movement 2',
          },
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
