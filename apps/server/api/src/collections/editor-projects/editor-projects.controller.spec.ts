import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { EditorProjectsController } from './editor-projects.controller';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type: string, id: string) => {
    throw new NotFoundException(type, id);
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

vi.mock('@api/helpers/utils/pagination.util', () => ({
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
    id: testId('shared'),
    brandId: testId('shared'),
    organizationId: testId('shared'),
    userId: testId('shared'),
  }) as never;

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: testId('project'),
  isDeleted: false,
  name: 'My Project',
  organizationId: testId('shared'),
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
            findForRender: vi.fn().mockResolvedValue({ config: {} }),
            patch: vi.fn(),
            readProjectConfig: vi.fn((value: unknown) =>
              value && typeof value === 'object' && !Array.isArray(value)
                ? value
                : {},
            ),
          },
        },
        {
          provide: EditorRenderService,
          useValue: {
            cancel: vi.fn(),
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
      .overrideGuard(BetterAuthGuard)
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
        expect.objectContaining({
          config: expect.objectContaining({ name: 'New Project' }),
          organizationId: testId('shared'),
          userId: testId('shared'),
        }),
      );
      expect(result).toMatchObject({ data: project });
    });

    it('builds video track when sourceVideoId is provided', async () => {
      const videoId = testId('shared');
      const video = {
        id: videoId,
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
        ingredients: { some: { id: videoId } },
      });
      expect(editorProjectsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            name: 'Video Project',
            sourceVideoId: videoId,
          }),
          organizationId: testId('shared'),
          tracks: expect.any(Array),
          userId: testId('shared'),
        }),
      );
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when sourceVideoId does not resolve', async () => {
      ingredientsService.findOne.mockResolvedValue(null as never);

      const fakeVideoId = testId('shared');
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
        {
          orderBy: { updatedAt: -1 },
          where: expect.objectContaining({
            brandId: testId('shared'),
            isDeleted: false,
            organizationId: testId('shared'),
          }),
        },
        expect.objectContaining({ limit: 20, page: 1 }),
      );
      expect(result).toBeDefined();
    });
  });

  // ── findOne ───────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('returns a project by id', async () => {
      const projectId = testId('project', 2);
      const project = makeProject({ id: projectId });
      editorProjectsService.findOne.mockResolvedValue(project as never);

      const result = await controller.findOne(
        makeRequest(),
        makeUser(),
        projectId,
      );

      expect(editorProjectsService.findOne).toHaveBeenCalledWith({
        id: projectId,
        organizationId: testId('shared'),
      });
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
      const project = makeProject({ config: { name: 'My Project' } });
      const updated = { ...project, name: 'Updated' };
      editorProjectsService.findOne.mockResolvedValue(project as never);
      editorProjectsService.patch.mockResolvedValue(updated as never);

      const result = await controller.update(
        makeRequest(),
        makeUser(),
        String(project.id),
        { name: 'Updated' } as never,
      );

      expect(editorProjectsService.patch).toHaveBeenCalledWith(
        String(project.id),
        { config: { name: 'Updated' } },
      );
      expect(result).toMatchObject({ data: updated });
    });

    it('persists Editor fields under config and tracks as the column', async () => {
      const settings = {
        backgroundColor: '#000000',
        format: 'portrait',
        fps: 30,
        height: 1920,
        width: 1080,
      };
      const tracks = [{ clips: [], id: 'track-1', name: 'Text 1' }];
      const project = makeProject({
        config: {
          name: 'Draft',
          renderExport: { job: { jobId: 'job-1' } },
          settings: { ...settings, format: 'landscape' },
          sourceVideoId: 'video-1',
          status: 'completed',
          totalDurationFrames: 300,
        },
      });
      editorProjectsService.findOne.mockResolvedValue(project as never);
      editorProjectsService.patch.mockResolvedValue(project as never);

      await controller.update(makeRequest(), makeUser(), String(project.id), {
        name: 'Edited',
        settings,
        totalDurationFrames: 450,
        tracks,
      } as never);

      expect(editorProjectsService.patch).toHaveBeenCalledWith(
        String(project.id),
        {
          config: {
            name: 'Edited',
            renderExport: { job: { jobId: 'job-1' } },
            settings,
            sourceVideoId: 'video-1',
            status: 'completed',
            totalDurationFrames: 450,
          },
          tracks,
        },
      );
    });

    it('produces an update the generated Prisma client accepts', async () => {
      // The service is mocked above, so a lenient mock would accept any
      // shape. Validate the exact payload against the real generated client:
      // it rejects unknown top-level fields (e.g. `name`) client-side, before
      // any connection is attempted.
      const { PrismaClient } =
        await vi.importActual<typeof import('@genfeedai/prisma')>(
          '@genfeedai/prisma',
        );
      const { PrismaPg } =
        await vi.importActual<typeof import('@prisma/adapter-pg')>(
          '@prisma/adapter-pg',
        );
      const project = makeProject({ config: { name: 'Draft' } });
      editorProjectsService.findOne.mockResolvedValue(project as never);
      editorProjectsService.patch.mockResolvedValue(project as never);

      await controller.update(makeRequest(), makeUser(), String(project.id), {
        name: 'Edited',
        settings: { fps: 30 },
        thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
        totalDurationFrames: 450,
        tracks: [],
      } as never);

      const [, data] = editorProjectsService.patch.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      const prisma = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: 'postgresql://127.0.0.1:1/validation-only',
        }),
      });
      const error = await prisma.editorProject
        .update({ data, where: { id: String(project.id) } })
        .catch((reason: unknown) => reason);
      await prisma.$disconnect();

      // Reaching the (unreachable) database proves validation passed.
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).not.toBe('PrismaClientValidationError');
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

      await controller.remove(makeRequest(), makeUser(), String(project.id));

      expect(editorProjectsService.patch).toHaveBeenCalledWith(
        String(project.id),
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

  // ── duplicate ─────────────────────────────────────────────────────────────
  describe('duplicate', () => {
    const tracks = [
      {
        clips: [],
        id: 'story',
        isLocked: false,
        isMuted: false,
        name: 'Story',
        type: 'text',
        volume: 100,
      },
    ];
    const settings = {
      backgroundColor: '#123456',
      format: 'portrait',
      fps: 30,
      height: 1920,
      width: 1080,
    };
    const makeComposition = () =>
      makeProject({
        brandId: testId('brand', 7),
        config: {
          composition: { id: 'product-story', inputHash: 'hash' },
          name: 'Product story',
          renderExport: { job: { jobId: 'job-1' } },
          settings,
          status: 'completed',
          totalDurationFrames: 360,
        },
        name: 'Product story',
        renderedVideoId: testId('video'),
        settings,
        totalDurationFrames: 360,
        tracks,
        userId: testId('user', 9),
      });

    it('creates an unlocked draft copy with the same tracks and settings', async () => {
      const source = makeComposition();
      const copy = makeProject({ id: testId('project', 3) });
      editorProjectsService.findOne.mockResolvedValue(source as never);
      editorProjectsService.create.mockResolvedValue(copy as never);

      const result = await controller.duplicate(
        makeRequest(),
        makeUser(),
        String(source.id),
      );

      expect(editorProjectsService.findOne).toHaveBeenCalledWith({
        id: String(source.id),
        isDeleted: false,
        organizationId: testId('shared'),
      });
      expect(editorProjectsService.create).toHaveBeenCalledWith({
        brandId: testId('brand', 7),
        config: {
          name: 'Product story (copy)',
          settings,
          status: 'draft',
          totalDurationFrames: 360,
        },
        organizationId: testId('shared'),
        tracks,
        userId: testId('shared'),
      });
      expect(result).toMatchObject({ data: copy });
    });

    it('never copies composition provenance or render output', async () => {
      editorProjectsService.findOne.mockResolvedValue(
        makeComposition() as never,
      );
      editorProjectsService.create.mockResolvedValue(makeProject() as never);

      await controller.duplicate(makeRequest(), makeUser(), 'source');

      const [created] = editorProjectsService.create.mock.calls[0] as [
        Record<string, unknown>,
      ];
      const config = created.config as Record<string, unknown>;
      expect(config).not.toHaveProperty('composition');
      expect(config).not.toHaveProperty('renderExport');
      expect(created).not.toHaveProperty('renderedVideoId');
    });

    it('returns not found for a project outside the organization', async () => {
      editorProjectsService.findOne.mockResolvedValue(null as never);

      await expect(
        controller.duplicate(makeRequest(), makeUser(), 'other-org-project'),
      ).rejects.toThrow(NotFoundException);
      expect(editorProjectsService.create).not.toHaveBeenCalled();
    });
  });

  it('preserves approved composition inputs and lifecycle across generic editor routes', async () => {
    const project = {
      ...makeProject(),
      config: { composition: { id: 'product-story' } },
    };
    editorProjectsService.findOne.mockResolvedValue(project as never);
    editorProjectsService.findForRender.mockResolvedValue(project as never);
    await expect(
      controller.update(makeRequest(), makeUser(), String(project.id), {}),
    ).rejects.toThrow('immutable');
    await expect(
      controller.render(makeRequest(), makeUser(), String(project.id)),
    ).rejects.toThrow('composition retry');
    await expect(
      controller.cancelRender(makeRequest(), makeUser(), String(project.id)),
    ).rejects.toThrow('composition cancel');
    expect(editorProjectsService.patch).not.toHaveBeenCalled();
    expect(editorRenderService.render).not.toHaveBeenCalled();
    expect(editorRenderService.cancel).not.toHaveBeenCalled();
  });

  // ── render ────────────────────────────────────────────────────────────────
  describe('render', () => {
    it('triggers render and returns the result', async () => {
      const project = makeProject();
      editorRenderService.render.mockResolvedValue(project as never);

      const result = await controller.render(
        makeRequest(),
        makeUser(),
        String(project.id),
      );

      expect(editorRenderService.render).toHaveBeenCalledWith(
        String(project.id),
        expect.any(String), // organizationId
        expect.any(Object), // user
      );
      expect(result).toBeDefined();
    });

    it('cancels the active render for the authenticated organization', async () => {
      const project = makeProject();
      editorRenderService.cancel.mockResolvedValue({
        jobId: 'job-123',
        projectId: String(project.id),
        status: 'cancelled',
      });

      const result = await controller.cancelRender(
        makeRequest(),
        makeUser(),
        String(project.id),
      );

      expect(editorRenderService.cancel).toHaveBeenCalledWith(
        String(project.id),
        expect.any(String),
      );
      expect(result).toBeDefined();
    });
  });
});
