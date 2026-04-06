import { ModelsController } from '@api/collections/models/controllers/models.controller';
import type { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import type { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import type { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { ModelSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

vi.mock('@genfeedai/helpers', async () => ({
  ...(await vi.importActual('@genfeedai/helpers')),
  getDeserializer: vi.fn((dto) => Promise.resolve(dto)),
}));

vi.mock('@helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

describe('ModelsController', () => {
  let controller: ModelsController;
  let modelsService: vi.Mocked<ModelsService>;
  let _loggerService: vi.Mocked<LoggerService>;

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

  const mockOrgId = new Types.ObjectId().toString();

  const mockRequest = {
    context: {
      organizationId: mockOrgId,
      userId: 'user-mongo-id',
      isSuperAdmin: false,
      subscriptionTier: 'free',
      stripeSubscriptionStatus: 'active',
      hydratedAt: Date.now(),
    },
    originalUrl: '/api/models',
    query: {},
  } as unknown as RequestWithContext;

  const mockRequestNoContext = {
    originalUrl: '/api/models',
    query: {},
  } as unknown as RequestWithContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelsController],
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
          provide: ModelsService,
          useValue: {
            count: vi.fn().mockResolvedValue(1),
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
            updateMany: vi.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ModelsController>(ModelsController);
    modelsService = module.get(ModelsService);
    _loggerService = module.get(LoggerService);

    vi.spyOn(ModelSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('enrichCreateDto', () => {
    it('should return dto without adding user fields for system entities', () => {
      const dto: CreateModelDto = {
        key: 'test-model',
        label: 'Test Model',
        type: 'text',
      };

      const result = controller.enrichCreateDto(dto);

      expect(result).toEqual(dto);
      expect(result).not.toHaveProperty('user');
      expect(result).not.toHaveProperty('brand');
      expect(result).not.toHaveProperty('organization');
    });
  });

  describe('enrichUpdateDto', () => {
    it('should return dto without adding user fields for system entities', async () => {
      const dto: UpdateModelDto = {
        label: 'Updated Model',
      };

      const result = await controller.enrichUpdateDto(dto);

      expect(result).toEqual(dto);
      expect(result).not.toHaveProperty('user');
      expect(result).not.toHaveProperty('brand');
      expect(result).not.toHaveProperty('organization');
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true for superadmin users', () => {
      const result = controller.canUserModifyEntity(mockSuperAdminUser);
      expect(result).toBe(true);
    });

    it('should return false for regular users', () => {
      const result = controller.canUserModifyEntity(mockRegularUser);
      expect(result).toBe(false);
    });

    it('should return false when isSuperAdmin is undefined', () => {
      const userWithoutSuperAdmin = {
        id: 'user-789',
        publicMetadata: {
          user: new Types.ObjectId().toString(),
        },
      } as unknown as User;

      const result = controller.canUserModifyEntity(userWithoutSuperAdmin);
      expect(result).toBe(false);
    });
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with default sort', () => {
      const query: ModelsQueryDto = {};

      const result = controller.buildFindAllPipeline(mockRegularUser, query);

      expect(result).toEqual([
        {
          $match: {
            isDeleted: false,
          },
        },
        {
          $sort: { createdAt: -1, key: 1, label: 1, type: 1 },
        },
      ]);
    });

    it('should build pipeline with custom sort', () => {
      const query: ModelsQueryDto = {
        isDeleted: true,
        sort: '-label,key',
      };

      const result = controller.buildFindAllPipeline(mockRegularUser, query);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        $match: {
          isDeleted: true,
        },
      });
      expect(result[1].$sort).toBeDefined();
    });
  });

  describe('getPopulateForOwnershipCheck', () => {
    it('should return empty array for Model entities', () => {
      const result = controller.getPopulateForOwnershipCheck();
      expect(result).toEqual([]);
    });
  });

  describe('findAll', () => {
    it('should return paginated models', async () => {
      const mockModels = {
        docs: [
          { _id: '1', key: 'model-1', label: 'Model 1', type: 'text' },
          { _id: '2', key: 'model-2', label: 'Model 2', type: 'image' },
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

      modelsService.findAll.mockResolvedValue(mockModels);

      const query: ModelsQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
      };

      const result = await controller.findAll(
        mockRequest,
        mockRegularUser,
        query,
      );

      expect(modelsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should append org-scoped $match stage when request context has organizationId', async () => {
      const mockModels = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 1,
      };

      modelsService.findAll.mockResolvedValue(mockModels);

      const query: ModelsQueryDto = {};

      await controller.findAll(mockRequest, mockRegularUser, query);

      const pipelineArg = modelsService.findAll.mock.calls[0][0];

      // Last stage must be the org filter $match
      const lastStage = pipelineArg[pipelineArg.length - 1];
      expect(lastStage).toEqual({
        $match: {
          $or: [
            { organization: null },
            { organization: { $exists: false } },
            { organization: new Types.ObjectId(mockOrgId) },
          ],
        },
      });
    });

    it('should not append org $match stage when request context has no organizationId', async () => {
      const mockModels = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        nextPage: null,
        page: 1,
        pagingCounter: 1,
        prevPage: null,
        totalDocs: 0,
        totalPages: 1,
      };

      modelsService.findAll.mockResolvedValue(mockModels);

      const query: ModelsQueryDto = {};

      await controller.findAll(mockRequestNoContext, mockRegularUser, query);

      const pipelineArg = modelsService.findAll.mock.calls[0][0];

      // No stage should contain $or with organization filter
      const hasOrgMatchStage = pipelineArg.some(
        (stage: Record<string, unknown>) =>
          stage.$match &&
          (stage.$match as Record<string, unknown>).$or !== undefined,
      );
      expect(hasOrgMatchStage).toBe(false);
    });

    it('should filter foreign org models even when enabledModels is present', async () => {
      // Simulates a scenario where enabledModels references a model from a different
      // org (e.g. data corruption). The org filter is the last line of defense.
      const mockOrgObjectId = new Types.ObjectId(mockOrgId);
      const foreignOrgId = new Types.ObjectId();
      const enabledModelId = new Types.ObjectId();

      const moduleRefMock = {
        findOne: vi.fn().mockResolvedValue({
          enabledModels: [enabledModelId],
          organization: foreignOrgId,
        }),
      };

      // Temporarily override getOrganizationSettingsService
      vi.spyOn(
        // biome-ignore lint/suspicious/noExplicitAny: spying on private method requires any cast
        controller as any,
        'getOrganizationSettingsService',
      ).mockReturnValue(moduleRefMock);

      const mockModels = { docs: [], totalDocs: 0 };
      modelsService.findAll.mockResolvedValue(mockModels);

      const query: ModelsQueryDto = {
        organizationId: foreignOrgId.toString(),
      };

      await controller.findAll(mockRequest, mockRegularUser, query);

      const pipelineArg = modelsService.findAll.mock.calls[0][0];

      // Verify the org-scoped $match is appended as the final stage
      const lastStage = pipelineArg[pipelineArg.length - 1];
      expect(lastStage).toEqual({
        $match: {
          $or: [
            { organization: null },
            { organization: { $exists: false } },
            { organization: mockOrgObjectId },
          ],
        },
      });

      // Verify the enabledModels $match is also present (first stage)
      const firstStage = pipelineArg[0];
      expect(firstStage).toEqual({
        $match: {
          _id: { $in: [enabledModelId] },
        },
      });
    });
  });

  describe('create', () => {
    it('should create a model', async () => {
      const createDto: CreateModelDto = {
        isDefault: false,
        key: 'new-model',
        label: 'New Model',
        type: 'text',
      };

      const mockCreatedModel = {
        _id: new Types.ObjectId(),
        ...createDto,
      };

      modelsService.create.mockResolvedValue(mockCreatedModel);

      const result = await controller.create(
        mockRequest,
        mockSuperAdminUser,
        createDto,
      );

      expect(modelsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('patch', () => {
    it('should allow superadmin to update a model', async () => {
      const id = new Types.ObjectId().toString();
      const updateDto: UpdateModelDto = {
        label: 'Updated Model',
      };

      const mockUpdatedModel = {
        _id: id,
        isDefault: false,
        key: 'model-1',
        label: 'Updated Model',
        type: 'text',
      };

      modelsService.findOne.mockResolvedValue(mockUpdatedModel);
      modelsService.patch.mockResolvedValue(mockUpdatedModel);

      const result = await controller.patch(
        mockRequest,
        mockSuperAdminUser,
        id,
        updateDto,
      );

      expect(modelsService.patch).toHaveBeenCalledWith(
        id,
        updateDto,
        expect.any(Array),
      );
      expect(result).toBeDefined();
    });

    it('should throw forbidden error for non-superadmin users', async () => {
      const id = new Types.ObjectId().toString();
      const updateDto: UpdateModelDto = {
        label: 'Updated Model',
      };

      await expect(
        controller.patch(mockRequest, mockRegularUser, id, updateDto),
      ).rejects.toThrow(HttpException);

      expect(modelsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should allow superadmin to remove a model', async () => {
      const id = new Types.ObjectId().toString();
      const mockModel = {
        _id: id,
        isDefault: false,
        key: 'model-1',
        label: 'Model 1',
        type: 'text',
      };

      modelsService.findOne.mockResolvedValue(mockModel);
      modelsService.remove.mockResolvedValue(mockModel);

      const result = await controller.remove(
        mockRequest,
        mockSuperAdminUser,
        id,
      );

      expect(modelsService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should throw forbidden error for non-superadmin users', async () => {
      const id = new Types.ObjectId().toString();

      await expect(
        controller.remove(mockRequest, mockRegularUser, id),
      ).rejects.toThrow(HttpException);

      expect(modelsService.remove).not.toHaveBeenCalled();
    });
  });
});
