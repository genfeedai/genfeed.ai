import { ElementsScenesController } from '@api/collections/elements/scenes/controllers/scenes.controller';
import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { User } from '@clerk/backend';
import { SceneSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

type SceneDocumentLike = {
  _id: string | Types.ObjectId;
  name?: string;
  organization?: string | Types.ObjectId;
  user?: string | Types.ObjectId;
  [key: string]: unknown;
};

type PaginatedScenes = {
  docs: SceneDocumentLike[];
  limit?: number;
  page?: number;
  totalDocs?: number;
  [key: string]: unknown;
};

const createBaseQuery = (partial: Partial<BaseQueryDto> = {}): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 20,
    page: 1,
    pagination: true,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

const asMatchStage = (stage: PipelineStage) =>
  stage as PipelineStage.Match & { $match: Record<string, unknown> };

const asSortStage = (stage: PipelineStage) =>
  stage as PipelineStage.Sort & { $sort: Record<string, unknown> };

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

describe('ElementsScenesController', () => {
  let controller: ElementsScenesController;
  let scenesService: vi.Mocked<ElementsScenesService>;

  const mockUser = {
    id: 'user-123',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      organization: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockUserWithoutOrg = {
    id: 'user-456',
    publicMetadata: {
      brand: new Types.ObjectId().toString(),
      user: new Types.ObjectId().toString(),
    } as IClerkPublicMetadata,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/scenes',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ElementsScenesController],
      providers: [
        {
          provide: ElementsScenesService,
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

    controller = module.get<ElementsScenesController>(ElementsScenesController);
    scenesService = module.get(ElementsScenesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new scene', async () => {
      const createDto: CreateElementSceneDto = {
        description: 'Test scene',
        name: 'New Scene',
      } as unknown as CreateElementSceneDto;

      const mockCreatedScene = {
        _id: new Types.ObjectId(),
        ...createDto,
        organization: mockUser.publicMetadata.organization,
      };

      scenesService.create.mockResolvedValueOnce(
        mockCreatedScene as unknown as never,
      );

      const result = await controller.create(mockRequest, mockUser, createDto);

      expect(scenesService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should include organization in created scene', async () => {
      const createDto: CreateElementSceneDto = {
        name: 'Org Scene',
      } as unknown as CreateElementSceneDto;

      const mockCreatedScene = {
        _id: new Types.ObjectId(),
        ...createDto,
        organization: mockUser.publicMetadata.organization,
      };

      scenesService.create.mockResolvedValueOnce(
        mockCreatedScene as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = scenesService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty('organization');
    });
  });

  describe('update', () => {
    it('should update an existing scene', async () => {
      const sceneId = new Types.ObjectId().toString();
      const updateDto: UpdateElementSceneDto = {
        name: 'Updated Scene',
      } as UpdateElementSceneDto;

      const mockExistingScene = {
        _id: sceneId,
        name: 'Old Scene',
        organization: new Types.ObjectId(
          mockUser.publicMetadata.organization as string,
        ),
        user: new Types.ObjectId(mockUser.publicMetadata.user as string),
      };

      const mockUpdatedScene = {
        ...mockExistingScene,
        ...updateDto,
      };

      scenesService.findOne.mockResolvedValueOnce(
        mockExistingScene as unknown as never,
      );
      scenesService.patch.mockResolvedValueOnce(
        mockUpdatedScene as unknown as never,
      );

      const result = await controller.update(
        mockRequest,
        mockUser,
        sceneId,
        updateDto,
      );

      expect(scenesService.findOne).toHaveBeenCalled();
      expect(scenesService.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when scene not found', async () => {
      const sceneId = new Types.ObjectId().toString();
      const updateDto: UpdateElementSceneDto = {
        name: 'Updated',
      } as UpdateElementSceneDto;

      scenesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.update(mockRequest, mockUser, sceneId, updateDto),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('should delete a scene', async () => {
      const sceneId = new Types.ObjectId().toString();
      const mockScene = {
        _id: sceneId,
        name: 'Scene to Delete',
        organization: new Types.ObjectId(
          mockUser.publicMetadata.organization as string,
        ),
        user: new Types.ObjectId(mockUser.publicMetadata.user as string),
      };

      scenesService.findOne.mockResolvedValueOnce(
        mockScene as unknown as never,
      );
      scenesService.remove.mockResolvedValueOnce(mockScene as unknown as never);

      const result = await controller.remove(mockRequest, mockUser, sceneId);

      expect(scenesService.findOne).toHaveBeenCalled();
      expect(scenesService.remove).toHaveBeenCalledWith(sceneId);
      expect(result).toBeDefined();
    });

    it('should throw error when scene not found', async () => {
      const sceneId = new Types.ObjectId().toString();

      scenesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, sceneId),
      ).rejects.toThrow();
      expect(scenesService.remove).not.toHaveBeenCalled();
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
      const query = createBaseQuery({ sort: 'name: 1' });
      const pipeline = controller.buildFindAllPipeline(mockUser, query);

      expect(pipeline).toHaveLength(2);
      const sortStage = asSortStage(pipeline[1]);
      expect(sortStage.$sort).toBeDefined();
    });

    it('should load organization scenes or defaults', () => {
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
        new Types.ObjectId(mockUser.publicMetadata.organization as string),
      );
    });
  });

  describe('role restrictions', () => {
    it('should require superadmin role for create', () => {
      const createMetadata = Reflect.getMetadata(
        'roles',
        ElementsScenesController.prototype.create,
      );
      expect(createMetadata).toEqual(['superadmin', 'admin']);
    });

    it('should require superadmin role for update', () => {
      const updateMetadata = Reflect.getMetadata(
        'roles',
        ElementsScenesController.prototype.update,
      );
      expect(updateMetadata).toEqual(['superadmin', 'admin']);
    });

    it('should require superadmin role for remove', () => {
      const removeMetadata = Reflect.getMetadata(
        'roles',
        ElementsScenesController.prototype.remove,
      );
      expect(removeMetadata).toEqual(['superadmin', 'admin']);
    });
  });

  describe('inherited methods', () => {
    it('should handle findAll with pagination', async () => {
      const mockScenes = {
        docs: [
          { _id: '1', name: 'Scene 1' },
          { _id: '2', name: 'Scene 2' },
        ],
        limit: 20,
        page: 1,
        totalDocs: 2,
      };

      scenesService.findAll.mockResolvedValueOnce(
        mockScenes as unknown as never,
      );

      const query = createBaseQuery();
      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(scenesService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle findOne', async () => {
      const sceneId = new Types.ObjectId().toString();
      const mockScene = {
        _id: sceneId,
        name: 'Scene 1',
      };

      scenesService.findOne.mockResolvedValueOnce(
        mockScene as unknown as never,
      );

      const result = await controller.findOne(mockRequest, mockUser, sceneId);

      expect(scenesService.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('serialization', () => {
    it('should use SceneSerializer for serialization', () => {
      expect(controller.serializer).toBeDefined();
      expect(controller.serializer).toBe(SceneSerializer);
    });

    it('should serialize findAll results', async () => {
      const mockScenes = {
        docs: [{ _id: '1', name: 'Scene 1' }],
        page: 1,
        totalDocs: 1,
      };

      scenesService.findAll.mockResolvedValueOnce(
        mockScenes as unknown as never,
      );

      const query = createBaseQuery();

      const result = await controller.findAll(mockRequest, mockUser, query);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
    });
  });
});
