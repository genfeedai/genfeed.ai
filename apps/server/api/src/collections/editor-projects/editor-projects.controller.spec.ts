import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { EditorProjectsController } from './editor-projects.controller';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type: string, id: string) => {
    throw new NotFoundException(`${type} ${id} not found`);
  }),
  serializeCollection: vi.fn((_req, _ser, data) => ({ data })),
  serializeSingle: vi.fn((_req, _ser, data) => ({ data })),
}));

vi.mock('@api/helpers/decorators/log/log-method.decorator', () => ({
  LogMethod:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

vi.mock('@api/helpers/decorators/swagger/auto-swagger.decorator', () => ({
  AutoSwagger: () => () => undefined,
}));

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(() => ({
    brand: '507f191e810c19729de860ee'.toHexString(),
    organization: '507f191e810c19729de860ee'.toHexString(),
    user: '507f191e810c19729de860ee'.toHexString(),
  })),
}));

vi.mock('@api/helpers/utils/pagination/pagination.util', () => ({
  customLabels: {},
}));

vi.mock('@api/helpers/utils/query-defaults/query-defaults.util', () => ({
  QueryDefaultsUtil: {
    getPaginationDefaults: vi.fn(() => ({ limit: 20, page: 1 })),
  },
}));

vi.mock('@api/helpers/utils/sort/sort.util', () => ({
  handleQuerySort: vi.fn(() => ({ createdAt: -1 })),
}));

const makeRequest = (): Request => ({}) as Request;

const makeUser = () =>
  ({
    id: 'user_clerk_123',
    publicMetadata: {
      brand: '507f191e810c19729de860ee'.toHexString(),
      organization: '507f191e810c19729de860ee'.toHexString(),
      user: '507f191e810c19729de860ee'.toHexString(),
    },
  }) as never;

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  _id: '507f191e810c19729de860ee',
  isDeleted: false,
  name: 'My Project',
  organization: '507f191e810c19729de860ee',
  ...overrides,
});

describe('EditorProjectsController', () => {
  let controller: EditorProjectsController;
  let editorProjectsService: vi.Mocked<EditorProjectsService>;
  let editorRenderService: vi.Mocked<EditorRenderService>;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let metadataService: vi.Mocked<MetadataService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EditorProjectsController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(() => 'https://cdn.genfeed.ai'),
            ingredientsEndpoint: 'https://cdn.genfeed.ai',
          },
        },
        {
          provide: EditorProjectsService,
          useValue: {
            create: vi.fn(),
            findAll: vi.fn(),
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: EditorRenderService,
          useValue: {
            render: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            findOne: vi.fn(),
          },
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
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EditorProjectsController>(EditorProjectsController);
    editorProjectsService = module.get(EditorProjectsService);
    editorRenderService = module.get(EditorRenderService);
    ingredientsService = module.get(IngredientsService);
    metadataService = module.get(MetadataService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe('create', () => {
    it('creates and returns a project without sourceVideoId', async () => {
      const project = makeProject();
      editorProjectsService.create.mockResolvedValue(project as never);

      const result = await controller.create(makeRequest(), makeUser(), {
        name: 'New Project',
      } as never);

      expect(editorProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Project' }),
      );
      expect(result).toMatchObject({ data: project });
    });

    it('builds video track when sourceVideoId is provided', async () => {
      const videoId = '507f191e810c19729de860ee'.toHexString();
      const video = {
        _id: videoId,
        thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      };
      const meta = { duration: 5, height: 1080, width: 1920 };
      const project = makeProject({ tracks: [{}] });

      ingredientsService.findOne.mockResolvedValue(video as never);
      metadataService.findOne.mockResolvedValue(meta as never);
      editorProjectsService.create.mockResolvedValue(project as never);

      const result = await controller.create(makeRequest(), makeUser(), {
        name: 'Video Project',
        sourceVideoId: videoId,
      } as never);

      expect(ingredientsService.findOne).toHaveBeenCalled();
      expect(metadataService.findOne).toHaveBeenCalledWith({
        ingredient: videoId,
      });
      expect(editorProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ tracks: expect.any(Array) }),
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when sourceVideoId does not resolve', async () => {
      ingredientsService.findOne.mockResolvedValue(null as never);

      const fakeVideoId = '507f191e810c19729de860ee'.toHexString();
      await expect(
        controller.create(makeRequest(), makeUser(), {
          name: 'Bad Video',
          sourceVideoId: fakeVideoId,
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns paginated projects', async () => {
      const paginatedResult = {
        docs: [makeProject()],
        page: 1,
        totalDocs: 1,
      };
      editorProjectsService.findAll.mockResolvedValue(paginatedResult as never);

      const result = await controller.findAll(
        makeRequest(),
        makeUser(),
        {} as never,
      );

      expect(editorProjectsService.findAll).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns a project by id', async () => {
      const project = makeProject();
      editorProjectsService.findOne.mockResolvedValue(project as never);

      const result = await controller.findOne(
        makeRequest(),
        makeUser(),
        String(project._id),
      );

      expect(editorProjectsService.findOne).toHaveBeenCalled();
      expect(result).toMatchObject({ data: project });
    });

    it('throws NotFoundException when project not found', async () => {
      editorProjectsService.findOne.mockResolvedValue(null as never);

      await expect(
        controller.findOne(makeRequest(), makeUser(), 'nonexistent_id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('updates and returns the project', async () => {
      const project = makeProject();
      const updated = { ...project, name: 'Updated' };
      editorProjectsService.findOne.mockResolvedValue(project as never);
      editorProjectsService.patch.mockResolvedValue(updated as never);

      const result = await controller.update(
        makeRequest(),
        makeUser(),
        String(project._id),
        { name: 'Updated' } as never,
      );

      expect(editorProjectsService.patch).toHaveBeenCalledWith(
        String(project._id),
        { name: 'Updated' },
      );
      expect(result).toMatchObject({ data: updated });
    });

    it('throws NotFoundException when project not found during update', async () => {
      editorProjectsService.findOne.mockResolvedValue(null as never);

      await expect(
        controller.update(makeRequest(), makeUser(), 'bad_id', {
          name: 'x',
        } as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────
  describe('remove', () => {
    it('soft-deletes a project by setting isDeleted=true', async () => {
      const project = makeProject();
      const deleted = { ...project, isDeleted: true };
      editorProjectsService.findOne.mockResolvedValue(project as never);
      editorProjectsService.patch.mockResolvedValue(deleted as never);

      await controller.remove(makeRequest(), makeUser(), String(project._id));

      expect(editorProjectsService.patch).toHaveBeenCalledWith(
        String(project._id),
        { isDeleted: true },
      );
    });

    it('throws NotFoundException when project not found during remove', async () => {
      editorProjectsService.findOne.mockResolvedValue(null as never);

      await expect(
        controller.remove(makeRequest(), makeUser(), 'bad_id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── render ────────────────────────────────────────────────────────────────
  describe('render', () => {
    it('triggers render and returns the result', async () => {
      const project = makeProject();
      editorRenderService.render.mockResolvedValue(project as never);

      const result = await controller.render(
        makeRequest(),
        makeUser(),
        String(project._id),
      );

      expect(editorRenderService.render).toHaveBeenCalledWith(
        String(project._id),
        expect.any(String), // organizationId
        expect.any(Object), // user
      );
      expect(result).toBeDefined();
    });
  });
});
