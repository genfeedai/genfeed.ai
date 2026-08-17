import type {
  AuthenticatedUser,
  AuthenticatedUser as User,
} from '@api/auth/interfaces/authenticated-user.interface';
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import type { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import type { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import type { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import { ModelSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
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

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    ModelSerializer: {
      serialize: vi.fn((data: unknown) => ({ data })),
    },
  };
});

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

  const organizationId = testId('org');
  const brandId = testId('brand');
  const userId = testId('user');

  const mockSuperAdminUser = {
    id: 'user-123',
    brandId,
    isSuperAdmin: true,
    organizationId,
    userId,
  } as unknown as User;

  const mockRegularUser = {
    id: 'user-456',
    brandId,
    isSuperAdmin: false,
    organizationId,
    userId,
  } as unknown as User;

  const mockOrgId = organizationId;

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
            clearOtherDefaults: vi.fn().mockResolvedValue(undefined),
            create: vi.fn(),
            approveRegistryModel: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            markRegistryModelLegacy: vi.fn(),
            patch: vi.fn(),
            rejectRegistryModel: vi.fn(),
            remove: vi.fn(),
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
        category: ModelCategory.TEXT,
        cost: 0,
        key: 'test-model',
        label: 'Test Model',
        provider: ModelProvider.OPENROUTER,
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
        userId,
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
        orderBy: { createdAt: -1, key: 1, label: 1 },
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
          { id: '1', key: 'model-1', label: 'Model 1', type: 'text' },
          { id: '2', key: 'model-2', label: 'Model 2', type: 'image' },
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
          OR: [{ organizationId: null }, { organizationId: mockOrgId }],
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

    it('should filter foreign org models even when enabledModelIds is present', async () => {
      // Simulates a scenario where enabledModelIds references a model from a different
      // org (e.g. data corruption). The org filter is the last line of defense.
      const scopedOrganizationId = mockOrgId;
      const foreignOrgId = testId('org', 2);
      const enabledModelId = testId('model');
      const organizationSettings = {
        enabledModelIds: [enabledModelId],
        organizationId: foreignOrgId,
      };

      const moduleRefMock = {
        ensureEnabledModelIds: vi
          .fn()
          .mockImplementation((settings: typeof organizationSettings) =>
            Promise.resolve(settings),
          ),
        findOne: vi.fn().mockResolvedValue(organizationSettings),
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

      expect(moduleRefMock.ensureEnabledModelIds).not.toHaveBeenCalled();
      expect(moduleRefMock.findOne).not.toHaveBeenCalled();
      expect(queryArg).toMatchObject({
        where: {
          OR: [
            { organizationId: null },
            { organizationId: scopedOrganizationId },
          ],
        },
      });
      expect(
        (queryArg as { where: Record<string, unknown> }).where.id,
      ).toBeUndefined();
    });

    it('seeds an empty allowlist before filtering by organizationId', async () => {
      const seededModelId = testId('model', 3);
      const emptySettings = {
        enabledModelIds: [],
        id: testId('setting'),
        organizationId: mockOrgId,
      };
      const settingsService = {
        ensureEnabledModelIds: vi.fn().mockResolvedValue({
          ...emptySettings,
          enabledModelIds: [seededModelId],
        }),
        findOne: vi.fn().mockResolvedValue(emptySettings),
      };

      vi.spyOn(
        // biome-ignore lint/suspicious/noExplicitAny: spying on private method requires any cast
        controller as any,
        'getOrganizationSettingsService',
      ).mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue({ docs: [], totalDocs: 0 });

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: mockOrgId,
      });

      expect(settingsService.ensureEnabledModelIds).toHaveBeenCalledWith(
        emptySettings,
      );
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: {
          id: { in: [seededModelId] },
        },
      });
    });

    it('keeps enable-none when seed still returns an empty allowlist', async () => {
      const emptySettings = {
        enabledModelIds: [],
        id: testId('setting'),
        organizationId: mockOrgId,
      };
      const settingsService = {
        ensureEnabledModelIds: vi.fn().mockResolvedValue(emptySettings),
        findOne: vi.fn().mockResolvedValue(emptySettings),
      };

      vi.spyOn(
        // biome-ignore lint/suspicious/noExplicitAny: spying on private method requires any cast
        controller as any,
        'getOrganizationSettingsService',
      ).mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue({ docs: [], totalDocs: 0 });

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: mockOrgId,
      });

      expect(settingsService.ensureEnabledModelIds).toHaveBeenCalledWith(
        emptySettings,
      );
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: {
          id: { in: [] },
        },
      });
    });

    it('does not seed a foreign organizationId from a non-admin caller', async () => {
      const foreignOrgId = testId('org', 5);
      const settingsService = {
        ensureEnabledModelIds: vi.fn(),
        findOne: vi.fn(),
      };

      vi.spyOn(
        // biome-ignore lint/suspicious/noExplicitAny: spying on private method requires any cast
        controller as any,
        'getOrganizationSettingsService',
      ).mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue({ docs: [], totalDocs: 0 });

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: foreignOrgId,
      });

      expect(settingsService.findOne).not.toHaveBeenCalled();
      expect(settingsService.ensureEnabledModelIds).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a model', async () => {
      const createDto: CreateModelDto = {
        category: ModelCategory.TEXT,
        cost: 0,
        isDefault: false,
        key: 'new-model',
        label: 'New Model',
        provider: ModelProvider.OPENROUTER,
      };

      const mockCreatedModel = {
        id: testId('model'),
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
      const id = testId('model');
      const updateDto: UpdateModelDto = {
        label: 'Updated Model',
      };

      const mockUpdatedModel = {
        id,
        isDefault: false,
        key: 'model-1',
        label: 'Updated Model',
        category: ModelCategory.TEXT,
        provider: ModelProvider.OPENROUTER,
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
      const id = testId('model');
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
      const id = testId('model');
      const approvedModel = {
        id,
        isActive: true,
        key: 'google/imagen-4',
        reviewStatus: 'approved',
      };
      modelsService.approveRegistryModel.mockResolvedValue(approvedModel);

      const result = await controller.patch(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        id,
        { label: 'Imagen 4', reviewStatus: 'approved' },
      );

      expect(modelsService.approveRegistryModel).toHaveBeenCalledWith(
        id,
        { label: 'Imagen 4' },
        mockSuperAdminUser.id,
      );
      expect(result).toEqual({ data: approvedModel });
    });

    it('should reject a discovered model without deleting it', async () => {
      const id = testId('model');
      const rejectedModel = {
        id,
        isActive: false,
        key: 'irrelevant/model',
        reviewStatus: 'rejected',
      };
      modelsService.rejectRegistryModel.mockResolvedValue(rejectedModel);
      modelsService.findOne.mockResolvedValue({
        id,
        isDefault: false,
      });

      await controller.patch(mockSuperAdminRequest, mockSuperAdminUser, id, {
        reason: 'Not content-generation relevant',
        reviewStatus: 'rejected',
      });

      expect(modelsService.rejectRegistryModel).toHaveBeenCalledWith(id, {
        reason: 'Not content-generation relevant',
        reviewedBy: mockSuperAdminUser.id,
      });
    });

    it('should mark a registry model as legacy', async () => {
      const id = testId('model');
      const legacyModel = {
        id,
        isActive: false,
        isLegacy: true,
        key: 'google/imagen-3',
      };
      modelsService.markRegistryModelLegacy.mockResolvedValue(legacyModel);
      modelsService.findOne.mockResolvedValue({
        id,
        isDefault: false,
      });

      await controller.patch(mockSuperAdminRequest, mockSuperAdminUser, id, {
        reviewStatus: 'legacy',
        succeededBy: 'google/imagen-4',
      });

      expect(modelsService.markRegistryModelLegacy).toHaveBeenCalledWith(id, {
        reviewedBy: mockSuperAdminUser.id,
        succeededBy: 'google/imagen-4',
      });
    });

    it('should not disable the only default model through review actions', async () => {
      const id = testId('model');
      modelsService.findOne.mockResolvedValue({
        id,
        category: 'image',
        isDefault: true,
      });
      modelsService.count.mockResolvedValue(0);

      await expect(
        controller.patch(mockSuperAdminRequest, mockSuperAdminUser, id, {
          reviewStatus: 'legacy',
        }),
      ).rejects.toThrow(HttpException);

      expect(modelsService.markRegistryModelLegacy).not.toHaveBeenCalled();
    });

    it('should forbid registry review actions for non-superadmins', async () => {
      await expect(
        controller.patch(mockRequest, mockRegularUser, 'id', {
          reviewStatus: 'approved',
        }),
      ).rejects.toThrow(HttpException);

      expect(modelsService.approveRegistryModel).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should allow superadmin to remove a model', async () => {
      const id = testId('model');
      const mockModel = {
        id,
        isDefault: false,
        key: 'model-1',
        label: 'Model 1',
        category: ModelCategory.TEXT,
        provider: ModelProvider.OPENROUTER,
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
      const id = testId('model');

      await expect(
        controller.remove(mockRequest, mockRegularUser, id),
      ).rejects.toThrow(HttpException);

      expect(modelsService.remove).not.toHaveBeenCalled();
    });
  });
});
