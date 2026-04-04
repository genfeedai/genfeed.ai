import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';
import { Folder } from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('FoldersService', () => {
  let service: FoldersService;
  let model: any;

  const mockFolderId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockUserId = new Types.ObjectId('507f1f77bcf86cd799439012');
  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439013');

  const mockFolder = {
    _id: mockFolderId,
    description: 'Test folder description',
    isDeleted: false,
    label: 'Test Folder',
    organization: mockOrganizationId,
    user: mockUserId,
  };

  beforeEach(async () => {
    // BaseService uses `new this.model(createDto)` so model must be a constructor
    const mockModelFn: any = Object.assign(
      vi.fn().mockImplementation(function (dto) {
        return {
          ...dto,
          _id: mockFolderId,
          save: vi.fn().mockResolvedValue(mockFolder),
        };
      }),
      {
        aggregate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
        aggregatePaginate: vi
          .fn()
          .mockResolvedValue({ docs: [], totalDocs: 0 }),
        collection: { name: 'folders' },
        find: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([mockFolder]),
          lean: vi.fn().mockReturnThis(),
          populate: vi.fn().mockReturnThis(),
        }),
        findById: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockFolder),
          populate: vi
            .fn()
            .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFolder) }),
        }),
        findByIdAndUpdate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockFolder),
          populate: vi
            .fn()
            .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFolder) }),
        }),
        findOne: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(mockFolder),
          populate: vi
            .fn()
            .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFolder) }),
        }),
        modelName: 'Folder',
        updateMany: vi.fn().mockReturnValue({
          exec: vi
            .fn()
            .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        }),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        {
          provide: getModelToken(Folder.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModelFn,
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
    }).compile();

    service = module.get<FoldersService>(FoldersService);
    model = module.get(getModelToken(Folder.name, DB_CONNECTIONS.CLOUD));

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a folder', async () => {
      const createDto: CreateFolderDto = {
        label: 'New Folder',
      };

      // model is a constructor; after save it returns mockFolder
      // BaseService.create does: new this.model(dto) → doc.save() → findById if populate requested
      const result = await service.create(createDto);

      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should find a folder by ID', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockFolder),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockFolder) }),
      });

      const result = await service.findOne({ _id: mockFolderId });

      expect(result).toEqual(mockFolder);
      expect(model.findOne).toHaveBeenCalledWith({ _id: mockFolderId });
    });

    it('should return null when folder not found', async () => {
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
      });

      const result = await service.findOne({ _id: mockFolderId });

      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    it('should update a folder', async () => {
      const updateDto: UpdateFolderDto = {
        label: 'Updated Folder',
      };

      const updatedFolder = { ...mockFolder, label: 'Updated Folder' };

      // BaseService.patch uses findByIdAndUpdate(...).populate(...).exec()
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedFolder),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(updatedFolder) }),
      });

      const result = await service.patch(mockFolderId.toString(), updateDto);

      expect(result.label).toBe('Updated Folder');
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        mockFolderId.toString(),
        { $set: updateDto },
        { returnDocument: 'after' },
      );
    });
  });

  describe('remove', () => {
    it('should soft delete a folder', async () => {
      const deletedFolder = { ...mockFolder, isDeleted: true };

      // BaseService.remove uses findByIdAndUpdate with isDeleted: true
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(deletedFolder),
        populate: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(deletedFolder) }),
      });

      const result = await service.remove(mockFolderId.toString());

      expect(result).not.toBeNull();
      expect(result?.isDeleted).toBe(true);
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        mockFolderId.toString(),
        { isDeleted: true },
        { returnDocument: 'after' },
      );
    });
  });
});
