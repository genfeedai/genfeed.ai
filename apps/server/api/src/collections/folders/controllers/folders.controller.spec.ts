import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { FolderSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
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

describe('FoldersController', () => {
  let controller: FoldersController;
  let foldersService: vi.Mocked<FoldersService>;
  let _loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
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

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with user and organization match', () => {
      const query: BaseQueryDto = {};

      const result = controller.buildFindAllPipeline(mockUser, query);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(1);
      const matchStage = result[0] as { $match: Record<string, unknown> };
      expect(matchStage.$match).toBeDefined();
      expect(matchStage.$match.isDeleted).toBe(false);
    });

    it('should handle deleted items', () => {
      const query: BaseQueryDto = { isDeleted: true };

      const result = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = result[0] as { $match: Record<string, unknown> };
      expect(matchStage.$match.isDeleted).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a folder', async () => {
      const createDto: CreateFolderDto = {
        description: 'Test Description',
        name: 'Test Folder',
      };

      const mockCreatedFolder = {
        _id: new Types.ObjectId(),
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
      const id = new Types.ObjectId().toString();
      const updateDto: UpdateFolderDto = {
        name: 'Updated Folder',
      };

      const mockExistingFolder = {
        _id: id,
        name: 'Old Folder',
        user: new Types.ObjectId(mockUser.publicMetadata.user as string),
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
      const id = new Types.ObjectId().toString();
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
      const id = new Types.ObjectId().toString();
      const mockFolder = {
        _id: id,
        name: 'Folder to Delete',
        user: new Types.ObjectId(mockUser.publicMetadata.user as string),
      };

      foldersService.findOne.mockResolvedValue(mockFolder);
      foldersService.remove.mockResolvedValue(mockFolder);

      const result = await controller.remove(mockRequest, mockUser, id);

      expect(foldersService.findOne).toHaveBeenCalledWith({ _id: id });
      expect(foldersService.remove).toHaveBeenCalledWith(id);
      expect(result).toBeDefined();
    });

    it('should throw error if folder not found', async () => {
      const id = new Types.ObjectId().toString();

      foldersService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, id),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error if user does not own the folder', async () => {
      const id = new Types.ObjectId().toString();
      const mockFolder = {
        _id: id,
        name: 'Folder',
        user: new Types.ObjectId(), // Different user
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
