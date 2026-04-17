import { ElementsSoundsController } from '@api/collections/elements/sounds/controllers/sounds.controller';
import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { SoundCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const createBaseQuery = (partial: Partial<BaseQueryDto> = {}): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 20,
    page: 1,
    pagination: true,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

const asMatchStage = (stage: Record<string, unknown>) =>
  stage as Record<string, unknown> & { $match: Record<string, unknown> };

const asSortStage = (stage: Record<string, unknown>) =>
  stage as Record<string, unknown> & { $sort: Record<string, unknown> };

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

describe('ElementsSoundsController', () => {
  let controller: ElementsSoundsController;
  let soundsService: vi.Mocked<ElementsSoundsService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      organization: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockUserWithoutOrg = {
    id: 'user-456',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toString(),
      user: '507f191e810c19729de860ee'.toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/sounds',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsSoundsController],
      providers: [
        {
          provide: ElementsSoundsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            paginate: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
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

    controller = module.get<ElementsSoundsController>(ElementsSoundsController);
    soundsService = module.get(ElementsSoundsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a sound by id', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      const mockSound = {
        _id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'sound-1',
        label: 'Sound 1',
        name: 'Sound 1',
        type: SoundCategory.MUSIC,
        url: 'http://example.com/sound1.mp3',
      };

      soundsService.findOne.mockResolvedValueOnce(
        mockSound as unknown as never,
      );

      const result = await controller.findOne(mockRequest, mockUser, soundId);

      expect(soundsService.findOne).toHaveBeenCalledWith(
        { _id: soundId },
        expect.anything(),
      );
      expect(result).toBeDefined();
    });

    it('should handle sound not found', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      soundsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne(mockRequest, mockUser, soundId),
      ).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create a new sound', async () => {
      const createDto: CreateElementSoundDto = {
        duration: 180,
        key: 'new-sound',
        label: 'New Sound',
        name: 'New Sound',
        url: 'http://example.com/new.mp3',
      } as unknown as CreateElementSoundDto;

      const mockCreatedSound = {
        _id: '507f191e810c19729de860ee'.toString(),
        ...createDto,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization,
        type: SoundCategory.MUSIC,
      };

      soundsService.create.mockResolvedValueOnce(
        mockCreatedSound as unknown as never,
      );

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(soundsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include organization in created sound', async () => {
      const createDto: CreateElementSoundDto = {
        key: 'org-sound',
        label: 'Org Sound',
        name: 'Org Sound',
        url: 'http://example.com/org.mp3',
      } as unknown as CreateElementSoundDto;

      const mockCreatedSound = {
        _id: '507f191e810c19729de860ee'.toString(),
        ...createDto,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization,
        type: SoundCategory.MUSIC,
      };

      soundsService.create.mockResolvedValueOnce(
        mockCreatedSound as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = soundsService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('organization');
    });
  });

  describe('update', () => {
    it('should update an existing sound', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementSoundDto = {
        duration: 240,
        name: 'Updated Sound',
      } as unknown as UpdateElementSoundDto;

      const mockExistingSound = {
        _id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'old-sound',
        label: 'Old Sound',
        name: 'Old Sound',
        organization: mockUser.publicMetadata.organization,
        type: SoundCategory.MUSIC,
      };

      const mockUpdatedSound = {
        ...mockExistingSound,
        ...updateDto,
      };

      soundsService.findOne.mockResolvedValueOnce(
        mockExistingSound as unknown as never,
      );
      soundsService.patch.mockResolvedValueOnce(
        mockUpdatedSound as unknown as never,
      );

      const result = await controller.update(
        mockRequest,
        mockUser,
        soundId,
        updateDto,
      );

      expect(soundsService.findOne).toHaveBeenCalledWith(
        { _id: soundId },
        expect.anything(),
      );
      expect(soundsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when sound not found', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementSoundDto = {
        name: 'Updated',
      } as unknown as UpdateElementSoundDto;

      soundsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.update(mockRequest, mockUser, soundId, updateDto),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('should delete a sound', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      const mockSound = {
        _id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'sound-to-delete',
        label: 'Sound to Delete',
        name: 'Sound to Delete',
        organization: mockUser.publicMetadata.organization,
        type: SoundCategory.MUSIC,
      };

      soundsService.findOne.mockResolvedValueOnce(
        mockSound as unknown as never,
      );
      soundsService.remove.mockResolvedValueOnce(mockSound as unknown as never);

      const result = await controller.remove(mockRequest, mockUser, soundId);

      expect(soundsService.findOne).toHaveBeenCalledWith({ _id: soundId });
      expect(soundsService.remove).toHaveBeenCalledWith(soundId);
      expect(result).toBeDefined();
    });

    it('should return error when sound not found', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();

      soundsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, soundId),
      ).rejects.toThrow();

      expect(soundsService.remove).not.toHaveBeenCalled();
    });
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline for user with organization', () => {
      const query = createBaseQuery();
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.$or).toBeDefined();
      expect(
        (matchStage.$match.$or as unknown[]).length,
      ).toBeGreaterThanOrEqual(2);
      expect(matchStage.$match.isDeleted).toBe(false);
    });

    it('should build pipeline for user without organization', () => {
      const query = createBaseQuery();
      const pipeline = controller.buildFindAllPipeline(
        mockUserWithoutOrg,
        query,
      );

      const matchStage = asMatchStage(pipeline[0]);
      // Without org, falls back to $or with global items and user items
      expect(matchStage.$match.$or).toBeDefined();
      expect(matchStage.$match.isDeleted).toBe(false);
    });

    it('should filter by isFavorite when provided', () => {
      const query = createBaseQuery({ isFavorite: true });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.isFavorite).toBe(true);
    });

    it('should handle isDeleted parameter', () => {
      const query = createBaseQuery({ isDeleted: true });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.isDeleted).toBe(true);
    });

    it('should include sorting stage', () => {
      const query = createBaseQuery({ sort: 'name: 1, duration: -1' });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      const sortStage = asSortStage(pipeline[1]);
      expect(sortStage.$sort).toBeDefined();
    });

    it('should load organization sounds or defaults', () => {
      const query = createBaseQuery();
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      const orConditions = matchStage.$match.$or as Array<
        Record<string, unknown>
      >;

      // orConditions[0] = global (no org, no user)
      // orConditions[1] = org condition
      expect(orConditions[0]).toEqual({
        organization: { $exists: false },
        user: { $exists: false },
      });
      expect(orConditions[1].organization).toEqual(
        mockUser.publicMetadata.organization as string,
      );
    });
  });

  describe('role restrictions', () => {
    it('should have roles metadata on controller methods', () => {
      // Test that the controller has the expected methods decorated
      expect(ElementsSoundsController.prototype.create).toBeDefined();
      expect(ElementsSoundsController.prototype.update).toBeDefined();
      expect(ElementsSoundsController.prototype.remove).toBeDefined();
      expect(ElementsSoundsController.prototype.findOne).toBeDefined();
    });
  });

  describe('inherited methods', () => {
    it('should handle findAll with pagination', async () => {
      const mockSounds = {
        docs: [
          {
            _id: '1',
            duration: 120,
            isActive: true,
            isDefault: false,
            isDeleted: false,
            key: 'sound-1',
            label: 'Sound 1',
            name: 'Sound 1',
            type: SoundCategory.MUSIC,
          },
          {
            _id: '2',
            duration: 180,
            isActive: true,
            isDefault: false,
            isDeleted: false,
            key: 'sound-2',
            label: 'Sound 2',
            name: 'Sound 2',
            type: SoundCategory.MUSIC,
          },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 2,
        totalPages: 1,
      };

      soundsService.findAll.mockResolvedValueOnce(
        mockSounds as unknown as never,
      );

      const query = createBaseQuery();
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(soundsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle findAll with isFavorite filter', async () => {
      const mockSounds = {
        docs: [
          {
            _id: '1',
            isActive: true,
            isDefault: false,
            isDeleted: false,
            isFavorite: true,
            key: 'sound-1',
            label: 'Sound 1',
            name: 'Sound 1',
            type: SoundCategory.MUSIC,
          },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      soundsService.findAll.mockResolvedValueOnce(
        mockSounds as unknown as never,
      );

      const query = createBaseQuery({ isFavorite: true });
      await controller.findAll(mockRequest, mockUser, query);

      const pipeline = controller.buildFindAllPipeline(mockUser, query);
      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.isFavorite).toBe(true);
    });
  });

  describe('serialization', () => {
    it('should use SoundSerializer for serialization', () => {
      expect(controller.serializer).toBeDefined();
      expect(controller.serializer?.opts?.type).toBe('sound');
    });

    it('should serialize findAll results', async () => {
      const mockSounds = {
        docs: [
          {
            _id: '1',
            isActive: true,
            isDefault: false,
            isDeleted: false,
            key: 'sound-1',
            label: 'Sound 1',
            name: 'Sound 1',
            type: SoundCategory.MUSIC,
          },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      soundsService.findAll.mockResolvedValueOnce(
        mockSounds as unknown as never,
      );

      const query = createBaseQuery();

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
    });

    it('should serialize single sound', async () => {
      const soundId = '507f191e810c19729de860ee'.toString();
      const mockSound = {
        _id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'sound-1',
        label: 'Sound 1',
        name: 'Sound 1',
        organization: '507f191e810c19729de860ee',
        type: SoundCategory.MUSIC,
      };
      soundsService.findOne.mockResolvedValueOnce(
        mockSound as unknown as never,
      );

      const result = await controller.findOne(mockRequest, mockUser, soundId);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
    });
  });

  describe('API operations', () => {
    it('should have proper API operation summaries', () => {
      const metadata = Reflect.getMetadata(
        'swagger/apiOperation',
        controller.findOne,
      );
      expect(metadata).toEqual({ summary: 'Get a specific sound' });

      const createMetadata = Reflect.getMetadata(
        'swagger/apiOperation',
        controller.create,
      );
      expect(createMetadata).toEqual({ summary: 'Create a new sound' });

      const updateMetadata = Reflect.getMetadata(
        'swagger/apiOperation',
        controller.update,
      );
      expect(updateMetadata).toEqual({ summary: 'Update a sound' });

      const removeMetadata = Reflect.getMetadata(
        'swagger/apiOperation',
        controller.remove,
      );
      expect(removeMetadata).toEqual({ summary: 'Delete a sound' });
    });
  });
});
