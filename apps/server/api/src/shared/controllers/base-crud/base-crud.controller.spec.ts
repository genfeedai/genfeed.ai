import type {
  AuthenticatedUser,
  AuthenticatedUser as User,
} from '@api/auth/interfaces/authenticated-user.interface';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

const MOCK_USER_ID = 'u07f1f77bcf86cd799439011';
const MOCK_ORG_ID = 'o07f1f77bcf86cd799439012';
const MOCK_BRAND_ID = 'b07f1f77bcf86cd799439013';

// Mock concrete implementation for testing
@Injectable()
class TestController extends BaseCRUDController<
  unknown,
  unknown,
  unknown,
  BaseQueryDto
> {
  buildFindAllQuery(user: User, query: BaseQueryDto) {
    return [
      {
        match: {
          isDeleted: query.isDeleted ?? false,
          userId: user.userId as string,
        },
      },
    ];
  }
}

// Mock serializer
class MockSerializer {
  opts: Record<string, unknown> = {};
  serialize(data: unknown) {
    return { data };
  }
}

type MockBaseService = {
  create: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  supportsField: ReturnType<typeof vi.fn>;
};

describe('BaseCRUDController', () => {
  let controller: TestController;
  let service: MockBaseService;
  let logger: LoggerService;
  let serializer: MockSerializer;

  const mockUser = {
    id: 'user-123',
    brandId: MOCK_BRAND_ID,
    organizationId: MOCK_ORG_ID,
    userId: MOCK_USER_ID,
  } as unknown as User;

  const superAdminUser = {
    id: 'user-admin',
    brandId: MOCK_BRAND_ID,
    isSuperAdmin: true,
    organizationId: MOCK_ORG_ID,
    userId: MOCK_USER_ID,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/test',
    query: {},
  } as Request;

  beforeEach(async () => {
    await Test.createTestingModule({
      providers: [
        {
          provide: BaseService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
            supportsField: vi.fn(() => true),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
      supportsField: vi.fn(() => true),
    };

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    serializer = new MockSerializer();

    controller = new TestController(
      logger,
      service as unknown as BaseService<unknown, unknown, unknown>,
      serializer,
      'TestEntity',
      ['user', 'brand'],
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const mockData = {
        docs: [
          { id: 'entity-1', name: 'Test 1' },
          { id: 'entity-2', name: 'Test 2' },
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

      service.findAll.mockResolvedValue(mockData);

      const query = {} as BaseQueryDto;
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            match: expect.objectContaining({
              isDeleted: false,
              userId: MOCK_USER_ID,
            }),
          }),
        ]),
        expect.objectContaining({
          limit: 10,
          page: 1,
          pagination: true,
        }),
      );

      expect(result).toEqual({ data: mockData.docs });
    });

    it('should handle empty results', async () => {
      const mockData = {
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

      service.findAll.mockResolvedValue(mockData);

      const query = {} as BaseQueryDto;
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toEqual({ data: [] });
    });

    it('should handle pagination parameters', async () => {
      const mockData = {
        docs: [{ id: 'entity-1', name: 'Test 1' }],
        hasNextPage: true,
        hasPrevPage: true,
        limit: 20,
        nextPage: 4,
        page: 3,
        pagingCounter: 41,
        prevPage: 2,
        totalDocs: 100,
        totalPages: 5,
      };

      service.findAll.mockResolvedValue(mockData);

      const query = {} as BaseQueryDto;
      await controller.findAll(mockRequest, mockUser, query);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          limit: 10,
          page: 1,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return entity by valid ID', async () => {
      const id = 'e07f1f77bcf86cd799439014';
      const mockEntity = {
        id,
        name: 'Test Entity',
        userId: mockUser.userId,
      };

      service.findOne.mockResolvedValue(mockEntity);

      const result = await controller.findOne(mockRequest, mockUser, id);

      expect(service.findOne).toHaveBeenCalledWith(
        { id, isDeleted: false },
        controller.getPopulateFields(),
      );
      expect(result).toEqual({ data: mockEntity });
    });

    it('should throw not found for an invalid entity ID', async () => {
      const invalidId = 'invalid-id';

      await expect(
        controller.findOne(mockRequest, mockUser, invalidId),
      ).rejects.toThrow(HttpException);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('should throw not found when entity does not exist', async () => {
      const id = 'e07f1f77bcf86cd799439015';
      service.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });

    // Regression: the inherited single-read used to run an unscoped
    // unscoped id lookup and serialize whatever came back, so any
    // authenticated user could read another organization's record by id.
    it('should throw not found for an entity owned by another organization', async () => {
      const id = 'e07f1f77bcf86cd799439020';
      service.findOne.mockResolvedValue({
        id,
        name: 'Foreign Entity',
        organizationId: 'c07f1f77bcf86cd7994390aa',
      });

      await expect(
        controller.findOne(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });

    it('should return an entity owned by the caller organization', async () => {
      const id = 'e07f1f77bcf86cd799439021';
      const mockEntity = {
        id,
        name: 'Own Entity',
        organizationId: MOCK_ORG_ID,
      };

      service.findOne.mockResolvedValue(mockEntity);

      const result = await controller.findOne(mockRequest, mockUser, id);

      expect(result).toEqual({ data: mockEntity });
    });

    it('should let a super admin read a foreign organization entity', async () => {
      const id = 'e07f1f77bcf86cd799439022';
      const mockEntity = {
        id,
        name: 'Foreign Entity',
        organizationId: 'c07f1f77bcf86cd7994390aa',
      };

      service.findOne.mockResolvedValue(mockEntity);

      const result = await controller.findOne(mockRequest, superAdminUser, id);

      expect(result).toEqual({ data: mockEntity });
    });
  });

  describe('create', () => {
    it('should create new entity', async () => {
      const createDto = {
        description: 'Test description',
        name: 'New Entity',
      };

      const mockCreatedEntity = {
        id: 'e07f1f77bcf86cd799439016',
        ...createDto,
        createdAt: new Date(),
        userId: mockUser.userId,
      };

      service.create.mockResolvedValue(mockCreatedEntity);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          brandId: expect.any(String),
          userId: expect.any(String),
        }),
        controller.getPopulateFields(),
      );
      expect(result).toEqual({ data: mockCreatedEntity });
    });

    it('should handle organization in metadata', async () => {
      const createDto = { name: 'New Entity' };
      const mockCreatedEntity = {
        id: 'e07f1f77bcf86cd799439017',
        ...createDto,
        organizationId: mockUser.organizationId,
      };

      service.create.mockResolvedValue(mockCreatedEntity);

      await controller.create(mockRequest, mockUser, createDto);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: expect.any(String),
        }),
        expect.any(Array),
      );
    });

    it('overrides tenant and user ownership supplied by the request body', async () => {
      service.create.mockResolvedValue({ id: 'entity-1' });

      await controller.create(mockRequest, mockUser, {
        name: 'Scoped Entity',
        organizationId: 'foreign-organization',
        userId: 'foreign-user',
      });

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: MOCK_ORG_ID,
          userId: MOCK_USER_ID,
        }),
        controller.getPopulateFields(),
      );
    });
  });

  describe('patch', () => {
    it('should update entity when user owns it', async () => {
      const id = 'e07f1f77bcf86cd799439018';
      const updateDto = {
        description: 'Updated description',
        name: 'Updated Name',
      };

      const existingEntity = {
        id,
        userId: MOCK_USER_ID,
      };

      const updatedEntity = {
        ...existingEntity,
        ...updateDto,
      };

      service.findOne.mockResolvedValue(existingEntity);
      service.patch.mockResolvedValue(updatedEntity);

      const result = await controller.patch(
        mockRequest,
        mockUser,
        id,
        updateDto,
      );

      expect(service.findOne).toHaveBeenCalledWith(
        { id },
        controller.getPopulateForOwnershipCheck(),
      );
      expect(service.patch).toHaveBeenCalledWith(
        id,
        {
          description: 'Updated description',
          name: 'Updated Name',
        },
        controller.getPopulateFields(),
      );
      expect(result).toEqual({ data: updatedEntity });
    });

    it('should throw not found for invalid ID', async () => {
      const invalidId = 'invalid-id';
      const updateDto = { name: 'Updated' };

      await expect(
        controller.patch(mockRequest, mockUser, invalidId, updateDto),
      ).rejects.toThrow(HttpException);

      expect(service.patch).not.toHaveBeenCalled();
    });

    it('strips tenant and user ownership changes from patch input', async () => {
      const id = 'e07f1f77bcf86cd799439018';
      const existingEntity = { id, userId: MOCK_USER_ID };
      service.findOne.mockResolvedValue(existingEntity);
      service.patch.mockResolvedValue(existingEntity);

      await controller.patch(mockRequest, mockUser, id, {
        name: 'Updated Name',
        organizationId: 'foreign-organization',
        userId: 'foreign-user',
      });

      expect(service.patch).toHaveBeenCalledWith(
        id,
        { name: 'Updated Name' },
        controller.getPopulateFields(),
      );
    });

    it('preserves the target organization for a cross-organization super-admin patch', async () => {
      const id = 'e07f1f77bcf86cd799439020';
      const targetOrganizationId = 'c07f1f77bcf86cd799439099';
      const existingEntity = {
        id,
        organizationId: targetOrganizationId,
        userId: 'c07f1f77bcf86cd799439088',
      };
      service.findOne.mockResolvedValue(existingEntity);
      service.patch.mockResolvedValue({
        ...existingEntity,
        name: 'Admin update',
      });

      await controller.patch(mockRequest, superAdminUser, id, {
        name: 'Admin update',
      });

      expect(service.patch).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          name: 'Admin update',
          organizationId: targetOrganizationId,
        }),
        controller.getPopulateFields(),
      );
      expect(service.patch).not.toHaveBeenCalledWith(
        id,
        expect.objectContaining({ organizationId: MOCK_ORG_ID }),
        expect.any(Array),
      );
    });
  });

  describe('remove', () => {
    it('should soft delete entity when user owns it', async () => {
      const id = 'e07f1f77bcf86cd799439019';
      const mockDeletedEntity = {
        id,
        isDeleted: true,
        name: 'Deleted Entity',
        userId: MOCK_USER_ID,
      };

      service.findOne.mockResolvedValue(mockDeletedEntity);
      service.remove.mockResolvedValue(mockDeletedEntity);

      const result = await controller.remove(mockRequest, mockUser, id);

      expect(service.findOne).toHaveBeenCalledWith({
        id,
        isDeleted: false,
      });
      expect(service.remove).toHaveBeenCalledWith(id);
      expect(result).toEqual({ data: mockDeletedEntity });
    });

    it('should throw not found for invalid ID', async () => {
      const invalidId = 'invalid-id';

      await expect(
        controller.remove(mockRequest, mockUser, invalidId),
      ).rejects.toThrow(HttpException);

      expect(service.remove).not.toHaveBeenCalled();
    });
  });

  describe('protected methods', () => {
    it('should build aggregation query correctly', () => {
      const inputQuery = { search: 'test' } as unknown as BaseQueryDto;
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toEqual([
        {
          match: {
            isDeleted: false,
            userId: MOCK_USER_ID,
          },
        },
      ]);
    });
  });

  describe('canUserModifyEntity', () => {
    // Prisma rows expose the scalar FK `userId`. The Mongo-era `user` alias is
    // a type-only field that is undefined at runtime on an unpopulated row
    // (getPopulateForOwnershipCheck() returns []), so ownership must resolve
    // from the scalar FK — see docs/identity-resolution.md.
    it('allows the owner identified by the scalar userId FK', () => {
      const entity = { id: 'e07f1f77bcf86cd79943901a', userId: MOCK_USER_ID };

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(true);
    });

    it('denies a non-owner identified by the scalar userId FK', () => {
      const entity = {
        id: 'e07f1f77bcf86cd79943901b',
        userId: 'c07f1f77bcf86cd7994390ff',
      };

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('denies when the entity carries no user pointer', () => {
      const entity = { id: 'e07f1f77bcf86cd79943901c' };

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });

    it('denies a row that only carries a populated user relation', () => {
      const entity = {
        id: 'e07f1f77bcf86cd79943901d',
        user: { id: MOCK_USER_ID },
      };

      expect(controller.canUserModifyEntity(mockUser, entity)).toBe(false);
    });
  });

  describe('canUserReadEntity', () => {
    // Containment check, not ownership: a teammate-owned row inside the
    // caller's organization must stay readable, while a row belonging to
    // another tenant must not.
    it('allows a row whose organizationId matches the caller', () => {
      const entity = {
        id: 'e07f1f77bcf86cd79943901e',
        organizationId: MOCK_ORG_ID,
        userId: 'c07f1f77bcf86cd7994390ff',
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(true);
    });

    it('denies a row whose organizationId belongs to another tenant', () => {
      const entity = {
        id: 'e07f1f77bcf86cd79943901f',
        organizationId: 'c07f1f77bcf86cd7994390aa',
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(false);
    });

    it('prefers the canonical organizationId when a relation is populated', () => {
      const entity = {
        id: 'e07f1f77bcf86cd799439023',
        organization: { id: 'other-organization' },
        organizationId: MOCK_ORG_ID,
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(true);
    });

    it('denies an organization-scoped row when the caller has no organization', () => {
      const entity = {
        id: 'e07f1f77bcf86cd799439024',
        organizationId: MOCK_ORG_ID,
      };
      const orglessUser = {
        userId: MOCK_USER_ID,
      } as unknown as User;

      expect(controller.canUserReadEntity(orglessUser, entity)).toBe(false);
    });

    // Shared/default catalog rows (e.g. `organizationId: null` presets and
    // elements) carry no tenancy pointer and stay readable by everyone.
    it('allows a row that carries no organization or brand pointer', () => {
      const entity = { id: 'e07f1f77bcf86cd799439025', organizationId: null };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(true);
    });

    // Link is the only model with brandId and no organizationId.
    it('falls back to brandId when the row carries no organizationId', () => {
      const entity = {
        id: 'e07f1f77bcf86cd799439026',
        brandId: MOCK_BRAND_ID,
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(true);
    });

    it('denies a row whose brandId belongs to another brand', () => {
      const entity = {
        id: 'e07f1f77bcf86cd799439027',
        brandId: 'c07f1f77bcf86cd7994390bb',
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(false);
    });

    it('prefers organizationId over brandId when both are present', () => {
      const entity = {
        id: 'e07f1f77bcf86cd799439028',
        brandId: MOCK_BRAND_ID,
        organizationId: 'c07f1f77bcf86cd7994390aa',
      };

      expect(controller.canUserReadEntity(mockUser, entity)).toBe(false);
    });
  });
});
