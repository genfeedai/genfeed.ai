import { EditorProject } from '@api/collections/editor-projects/schemas/editor-project.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EditorProjectStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EditorProjectsService } from './editor-projects.service';

const makeId = () => '507f191e810c19729de860ee';
const orgId = makeId();
const projectId = makeId();
const videoId = makeId();

const mockProject = {
  _id: projectId,
  isDeleted: false,
  organization: orgId,
  status: EditorProjectStatus.DRAFT,
};

describe('EditorProjectsService', () => {
  let service: EditorProjectsService;
  let model: Record<string, ReturnType<typeof vi.fn>>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'error' | 'warn'>>;

  beforeEach(async () => {
    model = {
      create: vi.fn().mockResolvedValue(mockProject),
      find: vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue([mockProject]) }),
      findByIdAndUpdate: vi.fn().mockResolvedValue({
        ...mockProject,
        status: EditorProjectStatus.COMPLETED,
      }),
      findOne: vi
        .fn()
        .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockProject) }),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ...mockProject,
        status: EditorProjectStatus.RENDERING,
      }),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as never;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EditorProjectsService,
        { provide: PrismaService, useValue: model },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    service = module.get<EditorProjectsService>(EditorProjectsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── markAsRendering ───────────────────────────────────────────────────────
  describe('markAsRendering', () => {
    it('transitions DRAFT project to RENDERING', async () => {
      model.findOneAndUpdate.mockResolvedValue({
        ...mockProject,
        status: EditorProjectStatus.RENDERING,
      });
      const result = await service.markAsRendering(
        projectId.toString(),
        orgId.toString(),
      );
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: { $ne: EditorProjectStatus.RENDERING },
        }),
        { status: EditorProjectStatus.RENDERING },
        expect.objectContaining({ returnDocument: 'after' }),
      );
      expect(result.status).toBe(EditorProjectStatus.RENDERING);
    });

    it('throws ConflictException when project is already RENDERING', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockProject,
          status: EditorProjectStatus.RENDERING,
        }),
      });
      await expect(
        service.markAsRendering(projectId.toString(), orgId.toString()),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when project does not exist', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);
      model.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(
        service.markAsRendering(projectId.toString(), orgId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses organizationId as scoping filter', async () => {
      await service.markAsRendering(projectId.toString(), orgId.toString());
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: orgId.toString(),
        }),
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  // ── markAsCompleted ───────────────────────────────────────────────────────
  describe('markAsCompleted', () => {
    it('sets COMPLETED status and assigns renderedVideo', async () => {
      model.findByIdAndUpdate.mockResolvedValue({
        ...mockProject,
        renderedVideo: videoId,
        status: EditorProjectStatus.COMPLETED,
      });
      const result = await service.markAsCompleted(
        projectId.toString(),
        videoId.toString(),
      );
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        projectId.toString(),
        {
          renderedVideo: videoId.toString(),
          status: EditorProjectStatus.COMPLETED,
        },
        expect.objectContaining({ returnDocument: 'after' }),
      );
      expect(result.status).toBe(EditorProjectStatus.COMPLETED);
    });

    it('throws NotFoundException when project is missing', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);
      await expect(
        service.markAsCompleted(projectId.toString(), videoId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── markAsFailed ──────────────────────────────────────────────────────────
  describe('markAsFailed', () => {
    it('sets FAILED status', async () => {
      model.findByIdAndUpdate.mockResolvedValue({
        ...mockProject,
        status: EditorProjectStatus.FAILED,
      });
      const result = await service.markAsFailed(projectId.toString());
      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        projectId.toString(),
        { status: EditorProjectStatus.FAILED },
        expect.objectContaining({ returnDocument: 'after' }),
      );
      expect(result.status).toBe(EditorProjectStatus.FAILED);
    });

    it('throws NotFoundException when project is missing', async () => {
      model.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.markAsFailed(projectId.toString())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── CAS idempotency ───────────────────────────────────────────────────────
  describe('CAS idempotency', () => {
    it('markAsRendering query excludes already-RENDERING status', async () => {
      await service
        .markAsRendering(projectId.toString(), orgId.toString())
        .catch(() => {
          /* ok */
        });
      const filter = model.findOneAndUpdate.mock.calls[0]?.[0];
      expect(filter?.status).toEqual({ $ne: EditorProjectStatus.RENDERING });
    });
  });
});
