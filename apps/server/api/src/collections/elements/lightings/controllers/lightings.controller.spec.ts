import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsLightingsController } from '@api/collections/elements/lightings/controllers/lightings.controller';
import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LightingSerializer } from '@genfeedai/serializers';
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

describe('ElementsLightingsController', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const brandId = '550e8400-e29b-41d4-a716-446655440003';
  const lightingId = '550e8400-e29b-41d4-a716-446655440004';
  let controller: ElementsLightingsController;
  let lightingsService: vi.Mocked<ElementsLightingsService>;

  const mockSuperAdminUser = {
    id: 'user-123',
    brandId: brandId,
    isSuperAdmin: true,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/elements/lightings',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsLightingsController],
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
          provide: ElementsLightingsService,
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

    controller = module.get<ElementsLightingsController>(
      ElementsLightingsController,
    );
    lightingsService = module.get(ElementsLightingsService);

    vi.spyOn(LightingSerializer, 'serialize').mockImplementation((data) => ({
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
    it('should create a lighting for superadmin', async () => {
      const createDto: CreateElementLightingDto = {
        key: 'test-lighting',
        label: 'Test Lighting',
      } as unknown as CreateElementLightingDto;

      const mockCreatedLighting = {
        id: lightingId,
        ...createDto,
        organizationId,
      };

      lightingsService.create.mockResolvedValue(mockCreatedLighting as never);

      const result = await controller.create(
        mockRequest,
        mockSuperAdminUser,
        createDto,
      );

      expect(lightingsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a lighting for superadmin', async () => {
      const updateDto: UpdateElementLightingDto = {
        label: 'Updated Lighting',
      } as unknown as UpdateElementLightingDto;

      const mockExistingLighting = {
        id: lightingId,
        key: 'old-lighting',
        label: 'Old Lighting',
        organizationId,
      };

      const mockUpdatedLighting = {
        ...mockExistingLighting,
        ...updateDto,
      };

      lightingsService.findOne.mockResolvedValue(mockExistingLighting as never);
      lightingsService.patch.mockResolvedValue(mockUpdatedLighting as never);

      const result = await controller.update(
        mockRequest,
        mockSuperAdminUser,
        lightingId,
        updateDto,
      );

      expect(lightingsService.findOne).toHaveBeenCalledWith(
        { id: lightingId },
        expect.anything(),
      );
      expect(lightingsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if lighting not found', async () => {
      const updateDto: UpdateElementLightingDto = {
        label: 'Updated Lighting',
      } as unknown as UpdateElementLightingDto;

      lightingsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(
          mockRequest,
          mockSuperAdminUser,
          lightingId,
          updateDto,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a lighting for superadmin', async () => {
      const mockLighting = {
        id: lightingId,
        key: 'delete-lighting',
        label: 'Lighting to Delete',
        organizationId,
      };

      lightingsService.findOne.mockResolvedValue(mockLighting as never);
      lightingsService.remove.mockResolvedValue(mockLighting as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        lightingId,
      );

      expect(lightingsService.findOne).toHaveBeenCalledWith({
        id: lightingId,
        isDeleted: false,
      });
      expect(lightingsService.remove).toHaveBeenCalledWith(lightingId);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated lightings', async () => {
      const mockLightings = {
        docs: [
          { id: 'lighting-1', key: 'lighting-1', label: 'Lighting 1' },
          { id: 'lighting-2', key: 'lighting-2', label: 'Lighting 2' },
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

      lightingsService.findAll.mockResolvedValue(mockLightings as never);

      const query = createBaseQuery();

      const result = await controller.findAll(
        mockRequest,
        mockSuperAdminUser,
        query,
      );

      expect(lightingsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle empty results', async () => {
      const mockLightings = {
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

      lightingsService.findAll.mockResolvedValue(mockLightings as never);

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
