import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsLensesController } from '@api/collections/elements/lenses/controllers/lenses.controller';
import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LensSerializer } from '@genfeedai/serializers';
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

describe('ElementsLensesController', () => {
  let controller: ElementsLensesController;
  let lensesService: vi.Mocked<ElementsLensesService>;

  const mockSuperAdminUser = {
    id: 'user-123',
    brandId: 'cmbrand000000000000000001',
    isSuperAdmin: true,
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/elements/lenses',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsLensesController],
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
          provide: ElementsLensesService,
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

    controller = module.get<ElementsLensesController>(ElementsLensesController);
    lensesService = module.get(ElementsLensesService);

    vi.spyOn(LensSerializer, 'serialize').mockImplementation((data) => ({
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
    it('should create a lens for superadmin', async () => {
      const createDto: CreateElementLensDto = {
        key: 'test-lens',
        label: 'Test Lens',
      } as unknown as CreateElementLensDto;

      const mockCreatedLens = {
        id: 'cmlens00000000000000000001',
        ...createDto,
        organizationId: mockSuperAdminUser.organizationId,
      };

      lensesService.create.mockResolvedValue(mockCreatedLens as never);

      const result = await controller.create(
        mockRequest,
        mockSuperAdminUser,
        createDto,
      );

      expect(lensesService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a lens for superadmin', async () => {
      const id = 'cmlens00000000000000000001';
      const updateDto: UpdateElementLensDto = {
        label: 'Updated Lens',
      } as unknown as UpdateElementLensDto;

      const mockExistingLens = {
        id,
        key: 'old-lens',
        label: 'Old Lens',
        organizationId: mockSuperAdminUser.organizationId,
      };

      const mockUpdatedLens = {
        ...mockExistingLens,
        ...updateDto,
      };

      lensesService.findOne.mockResolvedValue(mockExistingLens as never);
      lensesService.patch.mockResolvedValue(mockUpdatedLens as never);

      const result = await controller.update(
        mockRequest,
        mockSuperAdminUser,
        id,
        updateDto,
      );

      expect(lensesService.findOne).toHaveBeenCalledWith(
        { id },
        expect.anything(),
      );
      expect(lensesService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if lens not found', async () => {
      const id = 'cmlens00000000000000000001';
      const updateDto: UpdateElementLensDto = {
        label: 'Updated Lens',
      } as unknown as UpdateElementLensDto;

      lensesService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockSuperAdminUser, id, updateDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a lens for superadmin', async () => {
      const id = 'cmlens00000000000000000001';
      const mockLens = {
        id,
        key: 'delete-lens',
        label: 'Lens to Delete',
        organizationId: mockSuperAdminUser.organizationId,
      };

      lensesService.findOne.mockResolvedValue(mockLens as never);
      lensesService.remove.mockResolvedValue(mockLens as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(lensesService.findOne).toHaveBeenCalledWith({
        id,
        isDeleted: false,
      });
      expect(lensesService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated lenses', async () => {
      const mockLenses = {
        docs: [
          {
            id: 'cmlens00000000000000000001',
            key: 'lens-1',
            label: 'Lens 1',
          },
          {
            id: 'cmlens00000000000000000002',
            key: 'lens-2',
            label: 'Lens 2',
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

      lensesService.findAll.mockResolvedValue(mockLenses as never);

      const query = createBaseQuery();

      const result = await controller.findAll(
        mockRequest,
        mockSuperAdminUser,
        query,
      );

      expect(lensesService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle empty results', async () => {
      const mockLenses = {
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

      lensesService.findAll.mockResolvedValue(mockLenses as never);

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
