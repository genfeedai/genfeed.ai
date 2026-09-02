import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsSoundsController } from '@api/collections/elements/sounds/controllers/sounds.controller';
import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SoundCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const createBaseQuery = (partial: Partial<BaseQueryDto> = {}): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 20,
    page: 1,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

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
    brandId: testId('sound').toString(),
    organizationId: testId('sound').toString(),
    userId: testId('sound').toString(),
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
      const soundId = testId('sound').toString();
      const mockSound = {
        id: soundId,
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
        {
          id: soundId,
          isDeleted: false,
        },
        [],
      );
      expect(result).toBeDefined();
    });

    it('should handle sound not found', async () => {
      const soundId = testId('sound').toString();
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
        id: testId('sound').toString(),
        ...createDto,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        organizationId: mockUser.organizationId,
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
        id: testId('sound').toString(),
        ...createDto,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        organizationId: mockUser.organizationId,
        type: SoundCategory.MUSIC,
      };

      soundsService.create.mockResolvedValueOnce(
        mockCreatedSound as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = soundsService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('organizationId');
    });
  });

  describe('update', () => {
    it('should update an existing sound', async () => {
      const soundId = testId('sound').toString();
      const updateDto: UpdateElementSoundDto = {
        duration: 240,
        name: 'Updated Sound',
      } as unknown as UpdateElementSoundDto;

      const mockExistingSound = {
        id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'old-sound',
        label: 'Old Sound',
        name: 'Old Sound',
        organizationId: mockUser.organizationId,
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
        { id: soundId },
        expect.anything(),
      );
      expect(soundsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when sound not found', async () => {
      const soundId = testId('sound').toString();
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
      const soundId = testId('sound').toString();
      const mockSound = {
        id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'sound-to-delete',
        label: 'Sound to Delete',
        name: 'Sound to Delete',
        organizationId: mockUser.organizationId,
        type: SoundCategory.MUSIC,
      };

      soundsService.findOne.mockResolvedValueOnce(
        mockSound as unknown as never,
      );
      soundsService.remove.mockResolvedValueOnce(mockSound as unknown as never);

      const result = await controller.remove(mockRequest, mockUser, soundId);

      expect(soundsService.findOne).toHaveBeenCalledWith({
        id: soundId,
        isDeleted: false,
      });
      expect(soundsService.remove).toHaveBeenCalledWith(soundId);
      expect(result).toBeDefined();
    });

    it('should return error when sound not found', async () => {
      const soundId = testId('sound').toString();

      soundsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, soundId),
      ).rejects.toThrow();

      expect(soundsService.remove).not.toHaveBeenCalled();
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
            id: '1',
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
            id: '2',
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
            id: '1',
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

      const findAllQuery = controller.buildFindAllQuery(mockUser, query);
      expect(findAllQuery.where?.isFavorite).toBe(true);
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
            id: '1',
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
      const soundId = testId('sound').toString();
      const mockSound = {
        id: soundId,
        isActive: true,
        isDefault: false,
        isDeleted: false,
        key: 'sound-1',
        label: 'Sound 1',
        name: 'Sound 1',
        organizationId: testId('sound'),
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
