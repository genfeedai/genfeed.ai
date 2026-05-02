import { ElementsLightingsController } from '@api/collections/elements/lightings/controllers/lightings.controller';
import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { asMatchStage, asSortStage } from '@api/test/query-stage-assertions';
import type { User } from '@clerk/backend';
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
    pagination: true,
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
  let controller: ElementsLightingsController;
  let lightingsService: vi.Mocked<ElementsLightingsService>;
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
    loggerService = module.get(LoggerService);

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
      const query = createBaseQuery({ search: 'soft' });

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
    it('should create a lighting for superadmin', async () => {
      const createDto: CreateElementLightingDto = {
        key: 'test-lighting',
        label: 'Test Lighting',
      } as unknown as CreateElementLightingDto;

      const mockCreatedLighting = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
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
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementLightingDto = {
        label: 'Updated Lighting',
      } as unknown as UpdateElementLightingDto;

      const mockExistingLighting = {
        _id: id,
        key: 'old-lighting',
        label: 'Old Lighting',
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
        id,
        updateDto,
      );

      expect(lightingsService.findOne).toHaveBeenCalledWith(
        { _id: id },
        expect.anything(),
      );
      expect(lightingsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if lighting not found', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementLightingDto = {
        label: 'Updated Lighting',
      } as unknown as UpdateElementLightingDto;

      lightingsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockSuperAdminUser, id, updateDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a lighting for superadmin', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const mockLighting = {
        _id: id,
        key: 'delete-lighting',
        label: 'Lighting to Delete',
        user: mockSuperAdminUser.publicMetadata.user as string,
      };

      lightingsService.findOne.mockResolvedValue(mockLighting as never);
      lightingsService.remove.mockResolvedValue(mockLighting as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(lightingsService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(lightingsService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated lightings', async () => {
      const mockLightings = {
        docs: [
          { _id: '1', key: 'lighting-1', label: 'Lighting 1' },
          { _id: '2', key: 'lighting-2', label: 'Lighting 2' },
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
