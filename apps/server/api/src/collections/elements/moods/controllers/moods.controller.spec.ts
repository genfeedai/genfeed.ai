import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsMoodsController } from '@api/collections/elements/moods/controllers/moods.controller';
import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
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

describe('ElementsMoodsController', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const organizationId = '550e8400-e29b-41d4-a716-446655440002';
  const brandId = '550e8400-e29b-41d4-a716-446655440003';
  const moodId = '550e8400-e29b-41d4-a716-446655440004';
  let controller: ElementsMoodsController;
  let moodsService: vi.Mocked<ElementsMoodsService>;
  let loggerService: vi.Mocked<LoggerService>;

  const mockUser = {
    id: 'user-123',
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/moods',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsMoodsController],
      providers: [
        {
          provide: ElementsMoodsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            paginate: vi.fn(),
            patch: vi.fn(),
            remove: vi.fn(),
            supportsField: vi.fn((field: string) => field === 'organizationId'),
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

    controller = module.get<ElementsMoodsController>(ElementsMoodsController);
    moodsService = module.get(ElementsMoodsService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new mood', async () => {
      const createDto: CreateElementMoodDto = {
        description: 'Feeling happy',
        key: 'happy',
        label: 'Happy',
      } as unknown as CreateElementMoodDto;

      const mockCreatedMood = {
        id: moodId,
        ...createDto,
        isDeleted: false,
        organizationId,
      };

      moodsService.create.mockResolvedValueOnce(
        mockCreatedMood as unknown as never,
      );

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(moodsService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include organization in created mood', async () => {
      const createDto: CreateElementMoodDto = {
        key: 'excited',
        label: 'Excited',
      } as unknown as CreateElementMoodDto;

      const mockCreatedMood = {
        id: moodId,
        ...createDto,
        isDeleted: false,
        organizationId,
      };

      moodsService.create.mockResolvedValueOnce(
        mockCreatedMood as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = moodsService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('organizationId', organizationId);
    });
  });

  describe('update', () => {
    it('should update an existing mood', async () => {
      const updateDto: UpdateElementMoodDto = {
        label: 'Updated Mood',
      } as unknown as UpdateElementMoodDto;

      const mockExistingMood = {
        id: moodId,
        isDeleted: false,
        key: 'old-mood',
        label: 'Old Mood',
        organizationId,
      };

      const mockUpdatedMood = {
        ...mockExistingMood,
        ...updateDto,
      };

      moodsService.findOne.mockResolvedValueOnce(
        mockExistingMood as unknown as never,
      );
      moodsService.patch.mockResolvedValueOnce(
        mockUpdatedMood as unknown as never,
      );

      const result = await controller.update(
        mockRequest,
        mockUser,
        moodId,
        updateDto,
      );

      expect(moodsService.findOne).toHaveBeenCalled();
      expect(moodsService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when mood not found', async () => {
      const updateDto: UpdateElementMoodDto = {
        label: 'Updated',
      } as unknown as UpdateElementMoodDto;

      moodsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.update(mockRequest, mockUser, moodId, updateDto),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('should delete a mood', async () => {
      const mockMood = {
        id: moodId,
        isDeleted: false,
        key: 'mood-to-delete',
        label: 'Mood to Delete',
        organizationId,
      };

      moodsService.findOne.mockResolvedValueOnce(mockMood as unknown as never);
      moodsService.remove.mockResolvedValueOnce(mockMood as unknown as never);

      const result = await controller.remove(mockRequest, mockUser, moodId);

      expect(moodsService.findOne).toHaveBeenCalled();
      expect(moodsService.remove).toHaveBeenCalledWith(moodId);
      expect(result).toBeDefined();
    });

    it('should return error when mood not found', async () => {
      moodsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, moodId),
      ).rejects.toThrow();
      expect(moodsService.remove).not.toHaveBeenCalled();
    });
  });

  describe('role restrictions', () => {
    it('should require superadmin role for create', () => {
      const createMetadata = Reflect.getMetadata(
        'roles',
        ElementsMoodsController.prototype.create,
      );
      expect(createMetadata).toEqual(['superadmin', 'admin']);
    });

    it('should require superadmin role for update', () => {
      const updateMetadata = Reflect.getMetadata(
        'roles',
        ElementsMoodsController.prototype.update,
      );
      expect(updateMetadata).toEqual(['superadmin', 'admin']);
    });

    it('should require superadmin role for remove', () => {
      const removeMetadata = Reflect.getMetadata(
        'roles',
        ElementsMoodsController.prototype.remove,
      );
      expect(removeMetadata).toEqual(['superadmin', 'admin']);
    });
  });

  describe('inherited methods', () => {
    it('should handle findAll with pagination', async () => {
      const mockMoods = {
        docs: [
          { id: 'mood-happy', key: 'happy', label: 'Happy' },
          { id: 'mood-sad', key: 'sad', label: 'Sad' },
        ],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 2,
        totalPages: 1,
      };

      moodsService.findAll.mockResolvedValueOnce(mockMoods as unknown as never);

      const query = createBaseQuery();
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(moodsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle findOne', async () => {
      const mockMood = {
        id: moodId,
        isDeleted: false,
        key: 'happy',
        label: 'Happy',
        organizationId,
      };

      moodsService.findOne.mockResolvedValueOnce(mockMood as unknown as never);

      const result = await controller.findOne(mockRequest, mockUser, moodId);

      expect(moodsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when mood does not exist', async () => {
      moodsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne(mockRequest, mockUser, moodId),
      ).rejects.toThrow();
    });
  });

  describe('serialization', () => {
    it('should use MoodSerializer for serialization', () => {
      expect(controller.serializer).toBeDefined();
      expect(controller.serializer?.opts?.type).toBe('element-mood');
    });

    it('should serialize findAll results', async () => {
      const mockMoods = {
        docs: [{ id: 'mood-happy', key: 'happy', label: 'Happy' }],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      moodsService.findAll.mockResolvedValueOnce(mockMoods as unknown as never);

      const query = createBaseQuery();

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
    });

    it('should serialize single mood result', async () => {
      const mockMood = { id: moodId, key: 'happy', label: 'Happy' };

      moodsService.findOne.mockResolvedValueOnce(mockMood as unknown as never);

      const result = await controller.findOne(mockRequest, mockUser, moodId);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
    });
  });

  describe('base controller integration', () => {
    it('should properly extend BaseCRUDController', () => {
      expect(controller).toBeInstanceOf(ElementsMoodsController);
      expect(controller.service).toBe(moodsService);
      expect(controller.logger).toBe(loggerService);
      expect(controller.entityName).toBe('ElementMood');
    });

    it('should handle empty results from findAll', async () => {
      const mockEmptyResult = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 20,
        page: 1,
        pagingCounter: 1,
        totalDocs: 0,
        totalPages: 0,
      };

      moodsService.findAll.mockResolvedValueOnce(
        mockEmptyResult as unknown as never,
      );

      const query = createBaseQuery();
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
    });
  });
});
