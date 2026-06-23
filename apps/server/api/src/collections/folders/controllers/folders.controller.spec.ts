import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

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

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error: unknown) => {
      throw error;
    }),
    notFound: vi.fn((type: string, id: string) => {
      throw new HttpException(`${type} ${id} not found`, 404);
    }),
  },
}));

describe('FoldersController', () => {
  let controller: FoldersController;
  let foldersService: vi.Mocked<FoldersService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/folders',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FoldersController],
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
          provide: FoldersService,
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

    controller = module.get<FoldersController>(FoldersController);
    foldersService = module.get(FoldersService);
    _loggerService = module.get(LoggerService);

    vi.spyOn(FolderSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllQuery', () => {
    it('should build query with user and organization match', () => {
      const query: BaseQueryDto = {};

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        where: expect.objectContaining({
          isDeleted: false,
          OR: [
            { userId: '507f191e810c19729de860ee' },
            { organizationId: '507f191e810c19729de860ee' },
          ],
        }),
      });
    });

    it('should handle deleted items', () => {
      const query: BaseQueryDto = { isDeleted: true };

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result).toMatchObject({
        where: expect.objectContaining({
          isDeleted: true,
        }),
      });
    });

    it('should not include impossible global folder filters for brand context', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        brand: 'brand-1',
      } as BaseQueryDto & { brand: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: '507f191e810c19729de860ee',
            },
            { brandId: 'brand-1' },
          ],
        }),
      });
    });

    it('should not include impossible global folder filters for organization context', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        organization: 'org-1',
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [{ organizationId: 'org-1' }],
        }),
      });
    });

    it('should use scalar FK keys and never Prisma relation accessors (#565)', () => {
      // Relation accessors (brand/organization/user) expect a nested filter
      // object; emitting them with bare scalars crashed Prisma in prod (#565).
      // Every branch of every OR clause must use scalar FK keys only.
      const relationAccessorKeys = ['brand', 'organization', 'user'];
      const scenarios: Array<BaseQueryDto & Record<string, unknown>> = [
        {},
        { brand: 'brand-1' } as BaseQueryDto & { brand: string },
        { organization: 'org-1' } as BaseQueryDto & { organization: string },
      ];

      for (const query of scenarios) {
        const { where } = controller.buildFindAllQuery(mockUser, query);
        const orClauses = (where as { OR?: Array<Record<string, unknown>> }).OR;

        expect(orClauses).toBeDefined();
        for (const clause of orClauses ?? []) {
          for (const key of relationAccessorKeys) {
            expect(clause).not.toHaveProperty(key);
          }
        }
      }
    });
  });

  describe('create', () => {
    it('should create a folder', async () => {
      const createDto: CreateFolderDto = {
        description: 'Test Description',
        name: 'Test Folder',
      };

      const mockCreatedFolder = {
        _id: '507f191e810c19729de860ee',
        ...createDto,
        user: mockUser.publicMetadata.user,
      };

      foldersService.create.mockResolvedValue(mockCreatedFolder);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(foldersService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle errors during creation', async () => {
      const createDto: CreateFolderDto = {
        name: 'Test Folder',
      };

      foldersService.create.mockRejectedValue(new Error('Creation failed'));

      await expect(
        controller.create(mockRequest, mockUser, createDto),
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('update', () => {
    it('should update a folder', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateFolderDto = {
        name: 'Updated Folder',
      };

      const mockExistingFolder = {
        _id: id,
        name: 'Old Folder',
        user: mockUser.publicMetadata.user as string,
      };

      const mockUpdatedFolder = {
        ...mockExistingFolder,
        ...updateDto,
      };

      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue(mockUpdatedFolder);

      const result = await controller.update(
        mockRequest,
        mockUser,
        id,
        updateDto,
      );

      expect(foldersService.findOne).toHaveBeenCalled();
      expect(foldersService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if folder not found', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateFolderDto = {
        name: 'Updated Folder',
      };

      foldersService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockUser, id, updateDto),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('remove', () => {
    it('should remove a folder', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const mockFolder = {
        _id: id,
        name: 'Folder to Delete',
        user: mockUser.publicMetadata.user as string,
      };

      foldersService.findOne.mockResolvedValue(mockFolder);
      foldersService.remove.mockResolvedValue(mockFolder);

      const result = await controller.remove(mockRequest, mockUser, id);

      expect(foldersService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(foldersService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should throw error if folder not found', async () => {
      const id = '507f191e810c19729de860ee'.toString();

      foldersService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if user does not own the folder', async () => {
      const id = '507f191e810c19729de860ee'.toString();
      const mockFolder = {
        _id: id,
        name: 'Folder',
        user: '507f191e810c19729de860ee', // Different user
      };

      foldersService.findOne.mockResolvedValue(mockFolder);

      await expect(
        controller.remove(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('findAll', () => {
    it('should return paginated folders', async () => {
      const mockFolders = {
        docs: [
          { _id: '1', name: 'Folder 1', user: mockUser.publicMetadata.user },
          {
            _id: '2',
            name: 'Folder 2',
            organization: mockUser.publicMetadata.organization,
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

      foldersService.findAll.mockResolvedValue(mockFolders);

      const query: BaseQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
        pagination: true,
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(foldersService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle empty results', async () => {
      const mockFolders = {
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

      foldersService.findAll.mockResolvedValue(mockFolders);

      const query: BaseQueryDto = {
        isDeleted: false,
        limit: 10,
        page: 1,
      };

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
    });
  });
});
