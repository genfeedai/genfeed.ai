import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IAuthPublicMetadata } from '@api/shared/interfaces/auth/auth-public-metadata.interface';
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
    } as IAuthPublicMetadata,
  } as unknown as User;
  const mockSuperAdmin = {
    ...mockUser,
    publicMetadata: {
      ...mockUser.publicMetadata,
      isSuperAdmin: true,
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/folders',
    query: {},
  } as Request;
  const folderId = '507f191e810c19729de860ef';

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
    it('should build query with current brand and organization scope', () => {
      const query: BaseQueryDto = {};

      const result = controller.buildFindAllQuery(mockUser, query);

      expect(result).toBeDefined();
      expect(result).toMatchObject({
        where: expect.objectContaining({
          isDeleted: false,
          OR: [
            {
              brandId: null,
              organizationId: '507f191e810c19729de860ee',
            },
            {
              brandId: '507f191e810c19729de860ee',
              organizationId: '507f191e810c19729de860ee',
            },
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

    it('scopes current-brand queries to the caller organization', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        brand: '507f191e810c19729de860ee',
      } as BaseQueryDto & { brand: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: '507f191e810c19729de860ee',
            },
            {
              brandId: '507f191e810c19729de860ee',
              organizationId: '507f191e810c19729de860ee',
            },
          ],
        }),
      });
    });

    it('rejects a requested foreign organization', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        organization: 'org-1',
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          id: { in: [] },
        }),
      });
    });

    it('keeps ordinary members in current-brand scope when they request their organization', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        organization: mockUser.publicMetadata.organization,
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: mockUser.publicMetadata.organization,
            },
            {
              brandId: mockUser.publicMetadata.brand,
              organizationId: mockUser.publicMetadata.organization,
            },
          ],
        }),
      });
    });

    it('allows a superadmin to list every folder in a selected organization', () => {
      const result = controller.buildFindAllQuery(mockSuperAdmin, {
        organization: '507f191e810c19729de860aa',
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: {
          isDeleted: false,
          organizationId: '507f191e810c19729de860aa',
        },
      });
      expect(result.where).not.toHaveProperty('OR');
    });

    it('allows a superadmin to scope a selected organization to one brand', () => {
      const result = controller.buildFindAllQuery(mockSuperAdmin, {
        brand: '507f191e810c19729de860ab',
        organization: '507f191e810c19729de860aa',
      } as BaseQueryDto & { brand: string; organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: '507f191e810c19729de860aa',
            },
            {
              brandId: '507f191e810c19729de860ab',
              organizationId: '507f191e810c19729de860aa',
            },
          ],
        }),
      });
    });

    it('does not return folders for a requested foreign brand', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        brand: '507f191e810c19729de860aa',
      } as BaseQueryDto & { brand: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          id: { in: [] },
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
        { brand: '507f191e810c19729de860ee' } as BaseQueryDto & {
          brand: string;
        },
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
    it('creates a serialized folder in the caller organization and brand', async () => {
      const createDto: CreateFolderDto = {
        description: 'Test Description',
        label: 'Test Folder',
      };

      const mockCreatedFolder = {
        id: folderId,
        ...createDto,
        brandId: null,
        organizationId: mockUser.publicMetadata.organization,
        userId: mockUser.publicMetadata.user,
      };

      foldersService.create.mockResolvedValue(mockCreatedFolder);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(foldersService.create).toHaveBeenCalledWith(
        {
          brandId: null,
          description: 'Test Description',
          label: 'Test Folder',
          organizationId: mockUser.publicMetadata.organization,
          userId: mockUser.publicMetadata.user,
        },
        [],
      );
      expect(result).toEqual({ data: mockCreatedFolder });
    });

    it('creates a current-brand folder with scalar foreign keys', async () => {
      foldersService.create.mockResolvedValue({
        brandId: mockUser.publicMetadata.brand,
        id: folderId,
        label: 'Brand Folder',
        organizationId: mockUser.publicMetadata.organization,
        userId: mockUser.publicMetadata.user,
      });

      await controller.create(mockRequest, mockUser, {
        brand: mockUser.publicMetadata.brand,
        label: 'Brand Folder',
      });

      expect(foldersService.create).toHaveBeenCalledWith(
        {
          brandId: mockUser.publicMetadata.brand,
          label: 'Brand Folder',
          organizationId: mockUser.publicMetadata.organization,
          userId: mockUser.publicMetadata.user,
        },
        [],
      );
    });

    it('rejects a foreign brand on create', async () => {
      await expect(
        controller.create(mockRequest, mockUser, {
          brand: '507f191e810c19729de860aa',
          label: 'Foreign Brand Folder',
        }),
      ).rejects.toThrow(HttpException);

      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('should handle errors during creation', async () => {
      const createDto: CreateFolderDto = {
        label: 'Test Folder',
      };

      foldersService.create.mockRejectedValue(new Error('Creation failed'));

      await expect(
        controller.create(mockRequest, mockUser, createDto),
      ).rejects.toThrow('Creation failed');
    });
  });

  describe('findOne', () => {
    it('returns only active folders in the caller organization', async () => {
      const mockFolder = {
        id: folderId,
        isDeleted: false,
        label: 'Scoped Folder',
        organizationId: mockUser.publicMetadata.organization,
      };
      foldersService.findOne.mockResolvedValue(mockFolder);

      const result = await controller.findOne(
        mockRequest,
        mockUser,
        folderId,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith({
        _id: folderId,
        isDeleted: false,
        organizationId: mockUser.publicMetadata.organization,
      });
      expect(result).toEqual({ data: mockFolder });
    });

    it('returns not found when the folder is outside caller brand scope', async () => {
      foldersService.findOne.mockResolvedValue({
        brandId: '507f191e810c19729de860aa',
        id: folderId,
        isDeleted: false,
        label: 'Foreign Folder',
        organizationId: mockUser.publicMetadata.organization,
      });

      await expect(
        controller.findOne(mockRequest, mockUser, folderId),
      ).rejects.toThrow(HttpException);
    });

    it('allows a superadmin to read an active folder outside active tenant scope', async () => {
      const foreignFolder = {
        brandId: '507f191e810c19729de860ab',
        id: folderId,
        isDeleted: false,
        label: 'Foreign Folder',
        organizationId: '507f191e810c19729de860aa',
      };
      foldersService.findOne.mockResolvedValue(foreignFolder);

      const result = await controller.findOne(
        mockRequest,
        mockSuperAdmin,
        folderId,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith({
        _id: folderId,
        isDeleted: false,
      });
      expect(result).toEqual({ data: foreignFolder });
    });
  });

  describe('update', () => {
    it('should update a folder', async () => {
      const updateDto: UpdateFolderDto = {
        label: 'Updated Folder',
      };

      const mockExistingFolder = {
        id: folderId,
        label: 'Old Folder',
        organizationId: mockUser.publicMetadata.organization,
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
        folderId,
        updateDto,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith(
        { _id: folderId },
        [],
      );
      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { label: 'Updated Folder' },
        [],
      );
      expect(result).toEqual({ data: mockUpdatedFolder });
    });

    it('should throw error if folder not found', async () => {
      const updateDto: UpdateFolderDto = {
        label: 'Updated Folder',
      };

      foldersService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest, mockUser, folderId, updateDto),
      ).rejects.toThrow(HttpException);
    });

    it('rejects moving a folder to another brand', async () => {
      const mockExistingFolder = {
        id: folderId,
        label: 'Folder',
        organizationId: mockUser.publicMetadata.organization,
      };
      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue(mockExistingFolder);

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          brand: '507f191e810c19729de860aa',
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('moves a folder into the current brand using the scalar foreign key', async () => {
      const mockExistingFolder = {
        id: folderId,
        label: 'Shared Folder',
        organizationId: mockUser.publicMetadata.organization,
      };
      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue({
        ...mockExistingFolder,
        brandId: mockUser.publicMetadata.brand,
      });

      await controller.update(mockRequest, mockUser, folderId, {
        brand: mockUser.publicMetadata.brand,
      });

      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { brandId: mockUser.publicMetadata.brand },
        [],
      );
    });

    it('rejects updates to folders in another organization', async () => {
      foldersService.findOne.mockResolvedValue({
        id: folderId,
        label: 'Foreign Folder',
        organizationId: '507f191e810c19729de860aa',
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects updates to folders owned by another brand', async () => {
      foldersService.findOne.mockResolvedValue({
        brandId: '507f191e810c19729de860aa',
        id: folderId,
        label: 'Foreign Brand Folder',
        organizationId: mockUser.publicMetadata.organization,
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a folder', async () => {
      const mockFolder = {
        id: folderId,
        label: 'Folder to Delete',
        organizationId: mockUser.publicMetadata.organization,
      };

      foldersService.findOne.mockResolvedValue(mockFolder);
      foldersService.remove.mockResolvedValue({
        ...mockFolder,
        isDeleted: true,
      });

      const result = await controller.remove(
        mockRequest,
        mockUser,
        folderId,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith({ _id: folderId });
      expect(foldersService.remove).toHaveBeenCalledWith(folderId);
      expect(result).toEqual({
        data: expect.objectContaining({ isDeleted: true }),
      });
    });

    it('should throw error if folder not found', async () => {
      foldersService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, folderId),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if caller organization does not own the folder', async () => {
      const mockFolder = {
        id: folderId,
        label: 'Folder',
        organizationId: '507f191e810c19729de860aa',
      };

      foldersService.findOne.mockResolvedValue(mockFolder);

      await expect(
        controller.remove(mockRequest, mockUser, folderId),
      ).rejects.toThrow(HttpException);
      expect(foldersService.remove).not.toHaveBeenCalled();
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
