import { ModelsController } from '@api/collections/models/controllers/models.controller';
import type { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ModelCategory, ModelLifecycle, ModelProvider } from '@genfeedai/enums';
import { ModelSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { CreateModelDto } from '@server/collections/models/dto/create-model.dto';
import type { UpdateModelDto } from '@server/collections/models/dto/update-model.dto';
import type { ModelDocument } from '@server/collections/models/schemas/model.schema';
import { ModelsService } from '@server/collections/models/services/models.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import type { AggregatePaginateResult } from '@server/types/aggregate-paginate-result';

vi.mock('@server/helpers/utils/error-response/error-response.util', () => ({
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
  let moduleRefGet: ReturnType<typeof vi.fn>;

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

  const emptyPaginateResult = {
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
  } as AggregatePaginateResult<ModelDocument>;

  beforeEach(async () => {
    moduleRefGet = vi.fn();

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
            getProviderContracts: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            rejectRegistryModel: vi.fn(),
            remove: vi.fn(),
            transitionLifecycle: vi.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: moduleRefGet,
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
      const settingsService = {
        ensureForOrganization: vi.fn().mockResolvedValue(organizationSettings),
      };

      moduleRefGet.mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      const query = {
        organizationId: foreignOrgId.toString(),
      } as ModelsQueryDto;

      await controller.findAll(mockRequest, mockRegularUser, query);

      const queryArg = modelsService.findAll.mock.calls[0][0];

      expect(moduleRefGet).not.toHaveBeenCalled();
      expect(settingsService.ensureForOrganization).not.toHaveBeenCalled();
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

    it('self-heals missing settings through the canonical policy before filtering', async () => {
      const seededModelId = testId('model', 3);
      const seededSettings = {
        enabledModelIds: [seededModelId],
        id: testId('setting'),
        organizationId: mockOrgId,
      };
      const settingsService = {
        ensureForOrganization: vi.fn().mockResolvedValue(seededSettings),
      };

      moduleRefGet.mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: mockOrgId,
      } as ModelsQueryDto);

      expect(settingsService.ensureForOrganization).toHaveBeenCalledWith(
        mockOrgId,
      );
      expect(moduleRefGet).toHaveBeenCalledWith(OrganizationSettingsService, {
        strict: false,
      });
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: {
          AND: [
            {
              OR: [
                { id: { in: [seededModelId] } },
                { key: { in: [seededModelId] } },
              ],
            },
          ],
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
        ensureForOrganization: vi.fn().mockResolvedValue(emptySettings),
      };

      moduleRefGet.mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: mockOrgId,
      } as ModelsQueryDto);

      expect(settingsService.ensureForOrganization).toHaveBeenCalledWith(
        mockOrgId,
      );
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: {
          id: { in: [] },
        },
      });
    });

    it('reads a foreign organization allowlist without mutating it for a superadmin', async () => {
      const foreignOrgId = testId('org', 4);
      const enabledModelId = testId('model', 4);
      const settingsService = {
        ensureForOrganization: vi.fn(),
        findOne: vi.fn().mockResolvedValue({
          enabledModelIds: [enabledModelId],
          id: testId('setting', 4),
          organizationId: foreignOrgId,
        }),
      };

      moduleRefGet.mockReturnValue(settingsService);
      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      await controller.findAll(mockSuperAdminRequest, mockSuperAdminUser, {
        organizationId: foreignOrgId,
      } as ModelsQueryDto);

      expect(settingsService.findOne).toHaveBeenCalledWith({
        organizationId: foreignOrgId,
      });
      expect(settingsService.ensureForOrganization).not.toHaveBeenCalled();
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: {
          AND: [
            {
              OR: [
                { id: { in: [enabledModelId] } },
                { key: { in: [enabledModelId] } },
              ],
            },
          ],
        },
      });
    });

    it('returns an empty foreign organization view without creating settings for a superadmin', async () => {
      const foreignOrgId = testId('org', 6);
      const settingsService = {
        ensureForOrganization: vi.fn(),
        findOne: vi.fn().mockResolvedValue(null),
      };

      moduleRefGet.mockReturnValue(settingsService);
      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      const result = await controller.findAll(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        { organizationId: foreignOrgId } as ModelsQueryDto,
      );

      expect(result).toBeDefined();
      expect(settingsService.findOne).toHaveBeenCalledWith({
        organizationId: foreignOrgId,
      });
      expect(settingsService.ensureForOrganization).not.toHaveBeenCalled();
      expect(modelsService.findAll.mock.calls[0][0]).toMatchObject({
        where: { id: { in: [] } },
      });
    });

    it('does not seed a foreign organizationId from a non-admin caller', async () => {
      const foreignOrgId = testId('org', 5);
      const settingsService = {
        ensureForOrganization: vi.fn(),
      };

      moduleRefGet.mockReturnValue(settingsService);

      modelsService.findAll.mockResolvedValue(emptyPaginateResult);

      await controller.findAll(mockRequest, mockRegularUser, {
        organizationId: foreignOrgId,
      } as ModelsQueryDto);

      expect(moduleRefGet).not.toHaveBeenCalled();
      expect(settingsService.ensureForOrganization).not.toHaveBeenCalled();
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
    it('returns provider contracts to superadmins', async () => {
      const contracts = {
        endpoint: 'minimax/h3-max/text-to-video',
        pending: null,
        provider: ModelProvider.FAL,
        reviewed: null,
      };
      modelsService.getProviderContracts.mockResolvedValue(contracts);

      await expect(
        controller.getProviderContracts(
          mockSuperAdminRequest,
          mockSuperAdminUser,
          'model-1',
        ),
      ).resolves.toEqual(contracts);
    });

    it('forbids provider contract details for non-superadmins', async () => {
      await expect(
        controller.getProviderContracts(
          mockRequest,
          mockRegularUser,
          'model-1',
        ),
      ).rejects.toThrow(HttpException);
      expect(modelsService.getProviderContracts).not.toHaveBeenCalled();
    });

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
      } as unknown as ModelDocument);

      await controller.patch(mockSuperAdminRequest, mockSuperAdminUser, id, {
        reason: 'Not content-generation relevant',
        reviewStatus: 'rejected',
      });

      expect(modelsService.rejectRegistryModel).toHaveBeenCalledWith(id, {
        reason: 'Not content-generation relevant',
        reviewedBy: mockSuperAdminUser.id,
      });
    });

    it('routes lifecycle changes through the operator transition boundary', async () => {
      const id = testId('model');
      const availableModel = {
        category: ModelCategory.IMAGE,
        id,
        isDefault: false,
        lifecycle: ModelLifecycle.AVAILABLE,
      } as unknown as ModelDocument;
      modelsService.findOne.mockResolvedValue(availableModel);
      modelsService.transitionLifecycle.mockResolvedValue(availableModel);

      const result = await controller.patch(
        mockSuperAdminRequest,
        mockSuperAdminUser,
        id,
        { lifecycle: ModelLifecycle.AVAILABLE },
      );

      expect(modelsService.transitionLifecycle).toHaveBeenCalledWith(
        id,
        ModelLifecycle.AVAILABLE,
        undefined,
      );
      expect(result).toEqual({ data: availableModel });
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
