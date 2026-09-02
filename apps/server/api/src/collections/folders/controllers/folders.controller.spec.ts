import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import type { FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, HttpException } from '@nestjs/common';
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

  const mockBrandId = 'cmbrand000000000000000001';
  const mockOrganizationId = 'cmorganization000000000000001';
  const mockUserId = 'cmuser0000000000000000001';
  const foreignBrandId = 'cmbrand000000000000000002';
  const foreignOrganizationId = 'cmorganization000000000000002';

  const mockUser = {
    id: 'user-123',
    brandId: mockBrandId,
    isSuperAdmin: false,
    organizationId: mockOrganizationId,
    userId: mockUserId,
  } as unknown as User;
  const mockSuperAdmin = {
    ...mockUser,
    isSuperAdmin: true,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/folders',
    query: {},
  } as Request;
  const folderId = 'cmfolder000000000000000001';
  const fixtureDate = new Date('2026-01-01T00:00:00.000Z');

  /**
   * `FolderDocument` is the full Prisma row, so a partial literal cannot
   * satisfy the mocked service return type. Tests override only the fields
   * they assert on and inherit the rest.
   */
  const buildFolder = (
    overrides: Partial<FolderDocument> = {},
  ): FolderDocument => {
    return {
      brandId: null,
      createdAt: fixtureDate,
      description: null,
      id: folderId,
      isActive: true,
      isDeleted: false,
      label: 'Folder',
      organizationId: mockOrganizationId,
      parentId: null,
      updatedAt: fixtureDate,
      userId: mockUserId,
      ...overrides,
    } as FolderDocument;
  };

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
              organizationId: mockOrganizationId,
            },
            {
              brandId: mockBrandId,
              organizationId: mockOrganizationId,
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
        brand: mockBrandId,
      } as BaseQueryDto & { brand: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: mockOrganizationId,
            },
            {
              brandId: mockBrandId,
              organizationId: mockOrganizationId,
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
        organization: mockUser.organizationId,
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: mockUser.organizationId,
            },
            {
              brandId: mockUser.brandId,
              organizationId: mockUser.organizationId,
            },
          ],
        }),
      });
    });

    it('allows a superadmin to list every folder in a selected organization', () => {
      const result = controller.buildFindAllQuery(mockSuperAdmin, {
        organization: foreignOrganizationId,
      } as BaseQueryDto & { organization: string });

      expect(result).toMatchObject({
        where: {
          isDeleted: false,
          organizationId: foreignOrganizationId,
        },
      });
      expect(result.where).not.toHaveProperty('OR');
    });

    it('allows a superadmin to scope a selected organization to one brand', () => {
      const result = controller.buildFindAllQuery(mockSuperAdmin, {
        brand: foreignBrandId,
        organization: foreignOrganizationId,
      } as BaseQueryDto & { brand: string; organization: string });

      expect(result).toMatchObject({
        where: expect.objectContaining({
          OR: [
            {
              brandId: null,
              organizationId: foreignOrganizationId,
            },
            {
              brandId: foreignBrandId,
              organizationId: foreignOrganizationId,
            },
          ],
        }),
      });
    });

    it('does not return folders for a requested foreign brand', () => {
      const result = controller.buildFindAllQuery(mockUser, {
        brand: foreignBrandId,
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
        { brand: mockBrandId } as BaseQueryDto & {
          brand: string;
        },
        { organization: 'org-1' } as BaseQueryDto & { organization: string },
      ];

      for (const query of scenarios) {
        const { where } = controller.buildFindAllQuery(mockUser, query);
        const whereRecord = where as Record<string, unknown> & {
          OR?: Array<Record<string, unknown>>;
        };
        const clauses = [whereRecord, ...(whereRecord.OR ?? [])];

        for (const clause of clauses) {
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

      const mockCreatedFolder = buildFolder({
        brandId: null,
        description: createDto.description ?? null,
        id: folderId,
        label: createDto.label,
        organizationId: mockUser.organizationId,
        userId: mockUser.userId,
      });

      foldersService.create.mockResolvedValue(mockCreatedFolder);

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(foldersService.create).toHaveBeenCalledWith(
        {
          brandId: null,
          description: 'Test Description',
          label: 'Test Folder',
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        },
        [],
      );
      expect(result).toEqual({ data: mockCreatedFolder });
    });

    it('creates a current-brand folder with scalar foreign keys', async () => {
      foldersService.create.mockResolvedValue(
        buildFolder({
          brandId: mockUser.brandId,
          id: folderId,
          label: 'Brand Folder',
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        }),
      );

      await controller.create(mockRequest, mockUser, {
        brandId: mockUser.brandId,
        label: 'Brand Folder',
      });

      expect(foldersService.create).toHaveBeenCalledWith(
        {
          brandId: mockUser.brandId,
          label: 'Brand Folder',
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        },
        [],
      );
    });

    it('rejects a foreign brand on create', async () => {
      await expect(
        controller.create(mockRequest, mockUser, {
          brandId: foreignBrandId,
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
      const mockFolder = buildFolder({
        id: folderId,
        isDeleted: false,
        label: 'Scoped Folder',
        organizationId: mockUser.organizationId,
      });
      foldersService.findOne.mockResolvedValue(mockFolder);

      const result = await controller.findOne(mockRequest, mockUser, folderId);

      expect(foldersService.findOne).toHaveBeenCalledWith({
        id: folderId,
        isDeleted: false,
        organizationId: mockUser.organizationId,
      });
      expect(result).toEqual({ data: mockFolder });
    });

    it('returns not found when the folder is outside caller brand scope', async () => {
      foldersService.findOne.mockResolvedValue(
        buildFolder({
          brandId: foreignBrandId,
          id: folderId,
          isDeleted: false,
          label: 'Foreign Folder',
          organizationId: mockUser.organizationId,
        }),
      );

      await expect(
        controller.findOne(mockRequest, mockUser, folderId),
      ).rejects.toThrow(HttpException);
    });

    it('allows a superadmin to read an active folder outside active tenant scope', async () => {
      const foreignFolder = buildFolder({
        brandId: foreignBrandId,
        id: folderId,
        isDeleted: false,
        label: 'Foreign Folder',
        organizationId: foreignOrganizationId,
      });
      foldersService.findOne.mockResolvedValue(foreignFolder);

      const result = await controller.findOne(
        mockRequest,
        mockSuperAdmin,
        folderId,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith({
        id: folderId,
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

      const mockExistingFolder = buildFolder({
        id: folderId,
        label: 'Old Folder',
        organizationId: mockUser.organizationId,
      });

      const mockUpdatedFolder = buildFolder({
        id: folderId,
        label: 'Updated Folder',
        organizationId: mockUser.organizationId,
      });

      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue(mockUpdatedFolder);

      const result = await controller.update(
        mockRequest,
        mockUser,
        folderId,
        updateDto,
      );

      expect(foldersService.findOne).toHaveBeenCalledWith({ id: folderId }, []);
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
      const mockExistingFolder = buildFolder({
        id: folderId,
        label: 'Folder',
        organizationId: mockUser.organizationId,
      });
      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue(mockExistingFolder);

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          brandId: foreignBrandId,
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects capturing an organization-shared folder into a brand', async () => {
      const mockExistingFolder = buildFolder({
        id: folderId,
        label: 'Shared Folder',
        organizationId: mockUser.organizationId,
      });
      foldersService.findOne.mockResolvedValue(mockExistingFolder);
      foldersService.patch.mockResolvedValue({
        ...mockExistingFolder,
        brandId: mockUser.brandId,
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          brandId: mockUser.brandId,
        }),
      ).rejects.toMatchObject({ status: 403 });

      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects updates to folders in another organization', async () => {
      foldersService.findOne.mockResolvedValue(
        buildFolder({
          id: folderId,
          label: 'Foreign Folder',
          organizationId: foreignOrganizationId,
        }),
      );

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects updates to folders owned by another brand', async () => {
      foldersService.findOne.mockResolvedValue(
        buildFolder({
          brandId: foreignBrandId,
          id: folderId,
          label: 'Foreign Brand Folder',
          organizationId: mockUser.organizationId,
        }),
      );

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          label: 'Updated Folder',
        }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });
  });

  describe('folder tree parenting', () => {
    const parentId = 'cmfolder000000000000000002';
    const grandParentId = 'cmfolder000000000000000003';

    /**
     * `super.patch` loads the target with `findOne({ id }, [])` while parent
     * resolution loads ancestors with a scoped single-argument query, so the
     * mock answers by id.
     */
    const mockFoldersById = (
      folders: Record<string, FolderDocument | null>,
    ) => {
      foldersService.findOne.mockImplementation(
        (query: Record<string, unknown>) =>
          Promise.resolve(folders[String(query.id)] ?? null),
      );
    };

    it('files a new folder under a parent in the same scope', async () => {
      mockFoldersById({
        [parentId]: buildFolder({
          brandId: mockBrandId,
          id: parentId,
          label: 'Campaigns',
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.create.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.create(mockRequest, mockUser, {
        label: 'Q3',
        parentId,
      });

      expect(foldersService.create).toHaveBeenCalledWith(
        {
          brandId: mockBrandId,
          label: 'Q3',
          organizationId: mockOrganizationId,
          parentId,
          userId: mockUserId,
        },
        [],
      );
    });

    it('inherits an organization-shared parent scope', async () => {
      mockFoldersById({
        [parentId]: buildFolder({
          brandId: null,
          id: parentId,
          label: 'Shared',
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.create.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.create(mockRequest, mockUser, {
        brandId: mockBrandId,
        label: 'Child',
        parentId,
      });

      expect(foldersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: null, parentId }),
        [],
      );
    });

    it('creates a root folder when no parent is given', async () => {
      foldersService.create.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.create(mockRequest, mockUser, { label: 'Root' });

      expect(foldersService.findOne).not.toHaveBeenCalled();
      expect(foldersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: null, label: 'Root' }),
        [],
      );
    });

    it('rejects a parent in another organization', async () => {
      mockFoldersById({
        [parentId]: buildFolder({
          brandId: null,
          id: parentId,
          label: 'Foreign',
          organizationId: foreignOrganizationId,
        }),
      });

      await expect(
        controller.create(mockRequest, mockUser, { label: 'Child', parentId }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('rejects a parent owned by another brand', async () => {
      mockFoldersById({
        [parentId]: buildFolder({
          brandId: foreignBrandId,
          id: parentId,
          label: 'Other Brand',
          organizationId: mockOrganizationId,
        }),
      });

      await expect(
        controller.create(mockRequest, mockUser, { label: 'Child', parentId }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('rejects a missing parent', async () => {
      mockFoldersById({});

      await expect(
        controller.create(mockRequest, mockUser, { label: 'Child', parentId }),
      ).rejects.toThrow(HttpException);
      expect(foldersService.create).not.toHaveBeenCalled();
    });

    it('moves a folder under a new parent', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          label: 'Q3',
          organizationId: mockOrganizationId,
        }),
        [parentId]: buildFolder({
          brandId: mockBrandId,
          id: parentId,
          label: 'Campaigns',
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.patch.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.update(mockRequest, mockUser, folderId, { parentId });

      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { brandId: mockBrandId, parentId },
        [],
      );
    });

    it('rejects publishing a brand-private folder under a shared parent', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          organizationId: mockOrganizationId,
        }),
        [parentId]: buildFolder({
          brandId: null,
          id: parentId,
          organizationId: mockOrganizationId,
        }),
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, { parentId }),
      ).rejects.toMatchObject({ status: 403 });

      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects capturing a shared folder under a brand-private parent', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: null,
          id: folderId,
          organizationId: mockOrganizationId,
        }),
        [parentId]: buildFolder({
          brandId: mockBrandId,
          id: parentId,
          organizationId: mockOrganizationId,
        }),
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, { parentId }),
      ).rejects.toMatchObject({ status: 403 });

      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('allows a superadmin to move a private folder into shared scope', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          organizationId: mockOrganizationId,
        }),
        [parentId]: buildFolder({
          brandId: null,
          id: parentId,
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.patch.mockResolvedValue(
        buildFolder({ brandId: null, id: folderId, parentId }),
      );

      await controller.update(mockRequest, mockSuperAdmin, folderId, {
        parentId,
      });

      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { brandId: null, parentId },
        [],
      );
    });

    it('moves a folder to the root without clearing its brand scope', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          label: 'Q3',
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.patch.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.update(mockRequest, mockUser, folderId, {
        parentId: null,
      });

      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { parentId: null },
        [],
      );
    });

    it('rejects a folder parented to itself', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          label: 'Q3',
          organizationId: mockOrganizationId,
        }),
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          parentId: folderId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('rejects a move that would nest a folder inside its own descendant', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          label: 'Campaigns',
          organizationId: mockOrganizationId,
        }),
        // grandParent -> parent -> folderId, so moving folderId under
        // grandParent closes the loop.
        [grandParentId]: buildFolder({
          brandId: mockBrandId,
          id: grandParentId,
          label: 'Grandchild',
          organizationId: mockOrganizationId,
          parentId,
        }),
        [parentId]: buildFolder({
          brandId: mockBrandId,
          id: parentId,
          label: 'Child',
          organizationId: mockOrganizationId,
          parentId: folderId,
        }),
      });

      await expect(
        controller.update(mockRequest, mockUser, folderId, {
          parentId: grandParentId,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(foldersService.patch).not.toHaveBeenCalled();
    });

    it('leaves the parent untouched when the payload omits it', async () => {
      mockFoldersById({
        [folderId]: buildFolder({
          brandId: mockBrandId,
          id: folderId,
          label: 'Q3',
          organizationId: mockOrganizationId,
        }),
      });
      foldersService.patch.mockResolvedValue(buildFolder({ id: folderId }));

      await controller.update(mockRequest, mockUser, folderId, {
        label: 'Q4',
      });

      expect(foldersService.patch).toHaveBeenCalledWith(
        folderId,
        { label: 'Q4' },
        [],
      );
    });
  });

  describe('remove', () => {
    it('should remove a folder', async () => {
      const mockFolder = buildFolder({
        id: folderId,
        label: 'Folder to Delete',
        organizationId: mockUser.organizationId,
      });

      foldersService.findOne.mockResolvedValue(mockFolder);
      foldersService.remove.mockResolvedValue({
        ...mockFolder,
        isDeleted: true,
      });

      const result = await controller.remove(mockRequest, mockUser, folderId);

      expect(foldersService.findOne).toHaveBeenCalledWith({
        id: folderId,
        isDeleted: false,
      });
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
      const mockFolder = buildFolder({
        id: folderId,
        label: 'Folder',
        organizationId: foreignOrganizationId,
      });

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
          buildFolder({
            id: 'cmfolder000000000000000002',
            label: 'Folder 1',
            userId: mockUser.userId,
          }),
          buildFolder({
            id: 'cmfolder000000000000000003',
            label: 'Folder 2',
            organizationId: mockUser.organizationId,
          }),
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

  describe('canUserModifyEntity', () => {
    it('allows modification when the canonical organization ID matches', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          isDeleted: false,
          organizationId: mockOrganizationId,
        } as never),
      ).toBe(true);
    });

    it('does not authorize from the legacy organization relation alias', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          isDeleted: false,
          organization: { id: mockOrganizationId },
        } as never),
      ).toBe(false);
    });

    it('denies when the entity organizationId is missing', () => {
      expect(
        controller.canUserModifyEntity(mockUser, {
          isDeleted: false,
        } as never),
      ).toBe(false);
    });
  });
});
