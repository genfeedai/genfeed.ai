import { ElementsMoodsController } from '@api/collections/elements/moods/controllers/moods.controller';
import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import { asMatchStage, asSortStage } from '@api/test/query-stage-assertions';
import type { User } from '@clerk/backend';
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
  let controller: ElementsMoodsController;
  let moodsService: vi.Mocked<ElementsMoodsService>;
  let loggerService: vi.Mocked<LoggerService>;

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
        _id: '507f191e810c19729de860ee',
        ...createDto,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization as string,
        user: mockUser.publicMetadata.user as string,
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
        _id: '507f191e810c19729de860ee',
        ...createDto,
        isDeleted: false,
        organization: mockUser.publicMetadata.organization as string,
        user: mockUser.publicMetadata.user as string,
      };

      moodsService.create.mockResolvedValueOnce(
        mockCreatedMood as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = moodsService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('organization');
    });
  });

  describe('update', () => {
    it('should update an existing mood', async () => {
      const moodId = '507f191e810c19729de860ee'.toString();
      const updateDto: UpdateElementMoodDto = {
        label: 'Updated Mood',
      } as unknown as UpdateElementMoodDto;

      const mockExistingMood = {
        _id: moodId,
        isDeleted: false,
        key: 'old-mood',
        label: 'Old Mood',
        organization: mockUser.publicMetadata.organization as string,
        user: mockUser.publicMetadata.user as string,
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
      const moodId = '507f191e810c19729de860ee'.toString();
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
      const moodId = '507f191e810c19729de860ee'.toString();
      const mockMood = {
        _id: moodId,
        isDeleted: false,
        key: 'mood-to-delete',
        label: 'Mood to Delete',
        organization: mockUser.publicMetadata.organization as string,
        user: mockUser.publicMetadata.user as string,
      };

      moodsService.findOne.mockResolvedValueOnce(mockMood as unknown as never);
      moodsService.remove.mockResolvedValueOnce(mockMood as unknown as never);

      const result = await controller.remove(mockRequest, mockUser, moodId);

      expect(moodsService.findOne).toHaveBeenCalled();
      expect(moodsService.remove).toHaveBeenCalledWith(moodId);
      expect(result).toBeDefined();
    });

    it('should return error when mood not found', async () => {
      const moodId = '507f191e810c19729de860ee'.toString();

      moodsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, moodId),
      ).rejects.toThrow();
      expect(moodsService.remove).not.toHaveBeenCalled();
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

    it('should handle isDeleted parameter', () => {
      const query = createBaseQuery({ isDeleted: true });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      const matchStage = asMatchStage(pipeline[0]);
      expect(matchStage.$match.isDeleted).toBe(true);
    });

    it('should include sorting stage with default sort', () => {
      const query = createBaseQuery();
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      const sortStage = asSortStage(pipeline[1]);
      expect(sortStage.$sort).toBeDefined();
      expect(sortStage.$sort).toHaveProperty('createdAt', -1);
    });

    it('should include sorting stage with custom sort', () => {
      const query = createBaseQuery({ sort: 'name: 1' });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      const sortStage = asSortStage(pipeline[1]);
      expect(sortStage.$sort).toBeDefined();
    });

    it('should load organization moods or defaults', () => {
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

    it('should only load defaults when no organization', () => {
      const query = createBaseQuery();
      const pipeline = controller.buildFindAllPipeline(
        mockUserWithoutOrg,
        query,
      );

      const matchStage = asMatchStage(pipeline[0]);
      // Without org, global items condition is in $or array
      expect(matchStage.$match.$or).toBeDefined();
      expect(
        (matchStage.$match.$or as Array<Record<string, unknown>>)[0],
      ).toEqual({
        organization: { $exists: false },
        user: { $exists: false },
      });
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
          { _id: '1', key: 'happy', label: 'Happy' },
          { _id: '2', key: 'sad', label: 'Sad' },
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
      const moodId = '507f191e810c19729de860ee'.toString();
      const mockMood = {
        _id: moodId,
        isDeleted: false,
        key: 'happy',
        label: 'Happy',
        organization: '507f191e810c19729de860ee',
        user: '507f191e810c19729de860ee',
      };

      moodsService.findOne.mockResolvedValueOnce(mockMood as unknown as never);

      const result = await controller.findOne(mockRequest, mockUser, moodId);

      expect(moodsService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when mood does not exist', async () => {
      const moodId = '507f191e810c19729de860ee'.toString();

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
        docs: [{ _id: '1', key: 'happy', label: 'Happy' }],
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
      const moodId = '507f191e810c19729de860ee'.toString();
      const mockMood = { _id: moodId, key: 'happy', label: 'Happy' };

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
