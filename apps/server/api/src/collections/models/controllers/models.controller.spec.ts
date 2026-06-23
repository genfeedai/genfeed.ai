import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import type { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import type { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import type { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { ModelSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
    forbidden: vi.fn((detail: string) => {
      throw new HttpException(detail, 403);
    }),
    notFound: vi.fn((type: string, id: string) => {
      throw new HttpException(`${type} ${id} not found`, 404);
    }),
    validationFailed: vi.fn((errors: unknown[]) => {
      throw new HttpException({ errors }, 400);
    }),
  },
}));

vi.mock('@genfeedai/serializers', () => ({
  ModelSerializer: {
    serialize: vi.fn((data: unknown) => ({ data })),
  },
}));

type RequestWithContext = {
  context?: IRequestContext;
  originalUrl: string;
  query: Record<string, unknown>;
};

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

  const mockOrgId = '507f191e810c19729de860ee'.toString();

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

  const mockSuperAdminRequest = {
    ...mockRequest,
    context: {
      ...mockRequest.context,
      isSuperAdmin: true,
    },
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
            approveRegistryModel: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            markRegistryModelLegacy: vi.fn(),
            patch: vi.fn(),
            rejectRegistryModel: vi.fn(),
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
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as unknown as User;

      const result = controller.canUserModifyEntity(userWithoutSuperAdmin);
      expect(result).toBe(false);
    });
  });

  describe('buildFindAllQuery', () => {
    it('should build query with default sort', () => {
      const query: ModelsQueryDto = {};

      const result = controller.buildFindAllQuery(mockRegularUser, query);

      expect(result).toEqual({
        orderBy: { createdAt: -1, key: 1, label: 1, type: 1 },
        where: {
          isDeleted: false,
        },
      });
    });

    it('should build query with custom sort', () => {
      const query: ModelsQueryDto = {
        isDeleted: true,
        sort: '-label,key',
      };

      const result = controller.buildFindAllQuery(mockRegularUser, query);

      expect(result).toMatchObject({
        orderBy: expect.any(Object),
        where: {
          isDeleted: true,
        },
      });
    });

    it('should build query with provider registry status filters', () => {
      const query: ModelsQueryDto = {
        registryStatus: 'pending',
      };

      const result = controller.buildFindAllQuery(mockRegularUser, query);

      expect(result).toMatchObject({
        where: {
          isActive: false,
          isDeleted: false,
          isDiscovered: true,
          reviewStatus: 'pending',
        },
      });
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

    it('should append org-scoped match stage when request context has organizationId', async () => {
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

      const queryArg = modelsService.findAll.mock.calls[0][0];

      expect(queryArg).toMatchObject({
        where: {
          OR: [{ organization: null }, { organization: mockOrgId }],
        },
      });
    });

    it('should not append org match stage when request context has no organizationId', async () => {
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

      const queryArg = modelsService.findAll.mock.calls[0][0];

      expect(
        (queryArg as { where: Record<string, unknown> }).where.OR,
      ).toBeUndefined();
    });

    it('should filter foreign org models even when enabledModels is present', async () => {
      // Simulates a scenario where enabledModels references a model from a different
      // org (e.g. data corruption). The org filter is the last line of defense.
      const mockOrgObjectId = mockOrgId;
      const foreignOrgId = '507f191e810c19729de860ee';
      const enabledModelId = '507f191e810c19729de860ee';

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

      const queryArg = modelsService.findAll.mock.calls[0][0];

      expect(queryArg).toMatchObject({
        where: {
          OR: [{ organization: null }, { organization: mockOrgObjectId }],
        },
      });

      expect(queryArg).toMatchObject({
        where: {
          _id: { in: [enabledModelId] },
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
        _id: '507f191e810c19729de860ee',
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
      const id = '507f191e810c19729de860ee'.toString();
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
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateModelDto = {
        label: 'Updated Model',
      };

      await expect(
        controller.patch(mockRequest, mockRegularUser, id, updateDto),
      ).rejects.toThrow(HttpException);

      expect(modelsService.patch).not.toHaveBeenCalled();
    });
  });

  describe('registry review actions', () => {
    it('should approve a discovered model for superadmins', async () => {
      const id = '507f191e810c19729de860ee';
      const approvedModel = {
        _id: id,
        isActive: true,
        key: 'google/imagen-4',
        reviewStatus: 'approved',
      };
      modelsService.approveRegistryModel.mockResolvedValue(approvedModel);

      const result = await controller.approveRegistryModel(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        id,
        { label: 'Imagen 4' },
      );

      expect(modelsService.approveRegistryModel).toHaveBeenCalledWith(
        id,
        { label: 'Imagen 4' },
        mockSuperAdminUser.id,
      );
      expect(result).toEqual({ data: approvedModel });
    });

    it('should reject a discovered model without deleting it', async () => {
      const id = '507f191e810c19729de860ee';
      const rejectedModel = {
        _id: id,
        isActive: false,
        key: 'irrelevant/model',
        reviewStatus: 'rejected',
      };
      modelsService.rejectRegistryModel.mockResolvedValue(rejectedModel);
      modelsService.findOne.mockResolvedValue({
        _id: id,
        isDefault: false,
      });

      await controller.rejectRegistryModel(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        id,
        {
          reason: 'Not content-generation relevant',
        },
      );

      expect(modelsService.rejectRegistryModel).toHaveBeenCalledWith(id, {
        reason: 'Not content-generation relevant',
        reviewedBy: mockSuperAdminUser.id,
      });
    });

    it('should mark a registry model as legacy', async () => {
      const id = '507f191e810c19729de860ee';
      const legacyModel = {
        _id: id,
        isActive: false,
        isLegacy: true,
        key: 'google/imagen-3',
      };
      modelsService.markRegistryModelLegacy.mockResolvedValue(legacyModel);
      modelsService.findOne.mockResolvedValue({
        _id: id,
        isDefault: false,
      });

      await controller.markRegistryModelLegacy(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        id,
        { succeededBy: 'google/imagen-4' },
      );

      expect(modelsService.markRegistryModelLegacy).toHaveBeenCalledWith(id, {
        reviewedBy: mockSuperAdminUser.id,
        succeededBy: 'google/imagen-4',
      });
    });

    it('should not disable the only default model through review actions', async () => {
      const id = '507f191e810c19729de860ee';
      modelsService.findOne.mockResolvedValue({
        _id: id,
        category: 'image',
        isDefault: true,
      });
      modelsService.count.mockResolvedValue(0);

      await expect(
        controller.markRegistryModelLegacy(
          mockSuperAdminRequest,
          mockSuperAdminUser,
          id,
          {},
        ),
      ).rejects.toThrow(HttpException);

      expect(modelsService.markRegistryModelLegacy).not.toHaveBeenCalled();
    });

    it('should forbid registry review actions for non-superadmins', async () => {
      await expect(
        controller.approveRegistryModel(mockRequest, mockRegularUser, 'id', {}),
      ).rejects.toThrow(HttpException);

      expect(modelsService.approveRegistryModel).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should allow superadmin to remove a model', async () => {
      const id = '507f191e810c19729de860ee'.toString();
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
      const id = '507f191e810c19729de860ee'.toString();

      await expect(
        controller.remove(mockRequest, mockRegularUser, id),
      ).rejects.toThrow(HttpException);

      expect(modelsService.remove).not.toHaveBeenCalled();
    });
  });
});
