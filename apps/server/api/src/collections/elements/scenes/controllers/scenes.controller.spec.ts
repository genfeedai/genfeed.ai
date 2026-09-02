import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsScenesController } from '@api/collections/elements/scenes/controllers/scenes.controller';
import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SceneSerializer } from '@genfeedai/serializers';
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

describe('ElementsScenesController', () => {
  let controller: ElementsScenesController;
  let scenesService: vi.Mocked<ElementsScenesService>;

  const mockUser = {
    id: 'user-123',
    brandId: 'cmbrand000000000000000001',
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
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
        key: 'new-scene',
        label: 'New Scene',
      };

      const mockCreatedScene = {
        id: 'cmscene0000000000000000001',
        ...createDto,
        organizationId: mockUser.organizationId,
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
        key: 'org-scene',
        label: 'Org Scene',
      };

      const mockCreatedScene = {
        id: 'cmscene0000000000000000001',
        ...createDto,
        organizationId: mockUser.organizationId,
      };

      scenesService.create.mockResolvedValueOnce(
        mockCreatedScene as unknown as never,
      );

      await controller.create(mockRequest, mockUser, createDto);

      const createCall = scenesService.create.mock.calls[0][0];
      expect(createCall).toHaveProperty(
        'organizationId',
        mockUser.organizationId,
      );
    });
  });

  describe('update', () => {
    it('should update an existing scene', async () => {
      const sceneId = 'cmscene0000000000000000001';
      const updateDto: UpdateElementSceneDto = {
        label: 'Updated Scene',
      };

      const mockExistingScene = {
        id: sceneId,
        key: 'old-scene',
        label: 'Old Scene',
        organizationId: mockUser.organizationId as string,
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
      const sceneId = 'cmscene0000000000000000001';
      const updateDto: UpdateElementSceneDto = {
        label: 'Updated',
      };

      scenesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.update(mockRequest, mockUser, sceneId, updateDto),
      ).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('should delete a scene', async () => {
      const sceneId = 'cmscene0000000000000000001';
      const mockScene = {
        id: sceneId,
        key: 'scene-to-delete',
        label: 'Scene to Delete',
        organizationId: mockUser.organizationId as string,
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
      const sceneId = 'cmscene0000000000000000001';

      scenesService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.remove(mockRequest, mockUser, sceneId),
      ).rejects.toThrow();
      expect(scenesService.remove).not.toHaveBeenCalled();
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
          { id: 'cmscene0000000000000000001', label: 'Scene 1' },
          { id: 'cmscene0000000000000000002', label: 'Scene 2' },
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
      const sceneId = 'cmscene0000000000000000001';
      const mockScene = {
        id: sceneId,
        label: 'Scene 1',
        organizationId: mockUser.organizationId,
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
        docs: [{ id: 'cmscene0000000000000000001', label: 'Scene 1' }],
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
