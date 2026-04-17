import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BaseCRUDController } from '@api/shared/controllers/base-crud/base-crud.controller';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { BaseService } from '@api/shared/services/base/base.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

const MOCK_USER_ID = '507f1f77bcf86cd799439011';
const MOCK_ORG_ID = '507f1f77bcf86cd799439012';
const MOCK_BRAND_ID = '507f1f77bcf86cd799439013';

// Mock concrete implementation for testing
@Injectable()
class TestController extends BaseCRUDController<
  unknown,
  unknown,
  unknown,
  BaseQueryDto
> {
  buildFindAllPipeline(user: User, query: BaseQueryDto) {
    return [
      {
        $match: {
          isDeleted: query.isDeleted ?? false,
          user: user.publicMetadata.user as string,
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
};

describe('BaseCRUDController', () => {
  let controller: TestController;
  let service: MockBaseService;
  let logger: LoggerService;
  let serializer: MockSerializer;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: MOCK_BRAND_ID,
      organization: MOCK_ORG_ID,
      user: MOCK_USER_ID,
    } as IClerkPublicMetadata,
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
          { _id: '1', name: 'Test 1' },
          { _id: '2', name: 'Test 2' },
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
            $match: expect.objectContaining({
              isDeleted: false,
              user: MOCK_USER_ID,
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
        docs: [{ _id: '1', name: 'Test 1' }],
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
      const id = '507f1f77bcf86cd799439014';
      const mockEntity = {
        _id: id,
        name: 'Test Entity',
        user: mockUser.publicMetadata.user,
      };

      service.findOne.mockResolvedValue(mockEntity);

      const result = await controller.findOne(mockRequest, mockUser, id);

      expect(service.findOne).toHaveBeenCalledWith(
        { _id: id },
        controller.getPopulateFields(),
      );
      expect(result).toEqual({ data: mockEntity });
    });

    it('should throw not found for invalid ObjectId', async () => {
      const invalidId = 'invalid-id';

      await expect(
        controller.findOne(mockRequest, mockUser, invalidId),
      ).rejects.toThrow(HttpException);

      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('should throw not found when entity does not exist', async () => {
      const id = '507f1f77bcf86cd799439015';
      service.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('create', () => {
    it('should create new entity', async () => {
      const createDto = {
        description: 'Test description',
        name: 'New Entity',
      };

      const mockCreatedEntity = {
        _id: '507f1f77bcf86cd799439016',
        ...createDto,
        createdAt: new Date(),
        user: mockUser.publicMetadata.user,
      };

      service.create.mockResolvedValue(mockCreatedEntity);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          brand: expect.any(String),
          user: expect.any(String),
        }),
        controller.getPopulateFields(),
      );
      expect(result).toEqual({ data: mockCreatedEntity });
    });

    it('should handle organization in metadata', async () => {
      const createDto = { name: 'New Entity' };
      const mockCreatedEntity = {
        _id: '507f1f77bcf86cd799439017',
        ...createDto,
        organization: mockUser.publicMetadata.organization,
      };

      service.create.mockResolvedValue(mockCreatedEntity);

      await controller.create(mockRequest, mockUser, createDto);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: expect.any(String),
        }),
        expect.any(Array),
      );
    });
  });

  describe('patch', () => {
    it('should update entity when user owns it', async () => {
      const id = '507f1f77bcf86cd799439018';
      const updateDto = {
        description: 'Updated description',
        name: 'Updated Name',
      };

      const existingEntity = {
        _id: id,
        user: MOCK_USER_ID,
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
        { _id: id },
        controller.getPopulateForOwnershipCheck(),
      );
      expect(service.patch).toHaveBeenCalledWith(
        id,
        expect.objectContaining({
          description: 'Updated description',
          name: 'Updated Name',
          user: expect.any(String),
        }),
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
  });

  describe('remove', () => {
    it('should soft delete entity when user owns it', async () => {
      const id = '507f1f77bcf86cd799439019';
      const mockDeletedEntity = {
        _id: id,
        isDeleted: true,
        name: 'Deleted Entity',
        user: MOCK_USER_ID,
      };

      service.findOne.mockResolvedValue(mockDeletedEntity);
      service.remove.mockResolvedValue(mockDeletedEntity);

      const result = await controller.remove(mockRequest, mockUser, id);

      expect(service.findOne).toHaveBeenCalledWith({ _id: id });
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
    it('should build aggregation pipeline correctly', () => {
      const query = { search: 'test' } as unknown as BaseQueryDto;
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toEqual([
        {
          $match: {
            isDeleted: false,
            user: MOCK_USER_ID,
          },
        },
      ]);
    });
  });
});
