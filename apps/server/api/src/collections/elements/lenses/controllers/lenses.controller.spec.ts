import { ElementsLensesController } from '@api/collections/elements/lenses/controllers/lenses.controller';
import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { LensSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

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

const asMatchStage = (stage: PipelineStage) =>
  stage as PipelineStage.Match & { $match: Record<string, unknown> };

const asSortStage = (stage: PipelineStage) =>
  stage as PipelineStage.Sort & { $sort: Record<string, unknown> };

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
  let loggerService: vi.Mocked<LoggerService>;

  const mockSuperAdminUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      isSuperAdmin: true,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRegularUser = {
    id: 'user-456',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      isSuperAdmin: false,
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
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
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ElementsLensesController>(ElementsLensesController);
    lensesService = module.get(ElementsLensesService);
    loggerService = module.get(LoggerService);

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
      const query = createBaseQuery({ search: 'wide' });

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
    it('should create a lens for superadmin', async () => {
      const createDto: CreateElementLensDto = {
        key: 'test-lens',
        label: 'Test Lens',
      } as unknown as CreateElementLensDto;

      const mockCreatedLens = {
        _id: new Types.ObjectId(),
        ...createDto,
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
      const id = new Types.ObjectId().toString();
      const updateDto: UpdateElementLensDto = {
        label: 'Updated Lens',
      } as unknown as UpdateElementLensDto;

      const mockExistingLens = {
        _id: id,
        key: 'old-lens',
        label: 'Old Lens',
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
        { _id: new Types.ObjectId(id) },
        expect.anything(),
      );
      expect(lensesService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if lens not found', async () => {
      const id = new Types.ObjectId().toString();
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
      const id = new Types.ObjectId().toString();
      const mockLens = {
        _id: id,
        key: 'delete-lens',
        label: 'Lens to Delete',
        user: new Types.ObjectId(
          mockSuperAdminUser.publicMetadata.user as string,
        ),
      };

      lensesService.findOne.mockResolvedValue(mockLens as never);
      lensesService.remove.mockResolvedValue(mockLens as never);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(lensesService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(lensesService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return paginated lenses', async () => {
      const mockLenses = {
        docs: [
          { _id: '1', key: 'lens-1', label: 'Lens 1' },
          { _id: '2', key: 'lens-2', label: 'Lens 2' },
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
