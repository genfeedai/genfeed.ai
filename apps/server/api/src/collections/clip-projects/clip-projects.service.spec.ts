import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createPrisma() {
  return {
    _runtimeDataModel: {
      models: {
        ClipProject: {
          fields: [
            { name: 'id' },
            { name: 'mongoId' },
            { name: 'organizationId' },
            { name: 'brandId' },
            { name: 'status' },
            { name: 'progress' },
            { name: 'error' },
            { name: 'readyClipCount' },
            { name: 'failedClipCount' },
            { name: 'pendingClipCount' },
            { name: 'readiness' },
            { name: 'terminalAt' },
            { name: 'config' },
            { name: 'isDeleted' },
          ],
        },
      },
    },
    clipProject: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('ClipProjectsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: ClipProjectsService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new ClipProjectsService(
      prisma as unknown as PrismaService,
      createLogger(),
    );
  });

  it('maps create DTO fields to durable columns and config JSON', async () => {
    prisma.clipProject.create.mockResolvedValue({
      _id: 'project-1',
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'pending',
    });

    await service.create({
      language: 'en',
      name: 'Launch clip',
      organization: 'org-1',
      settings: { maxClips: 3 },
      sourceVideoUrl: 'https://example.com/source.mp4',
      status: 'pending',
      user: 'user-1',
    } as CreateClipProjectDto);

    expect(prisma.clipProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          language: 'en',
          name: 'Launch clip',
          settings: { maxClips: 3 },
          sourceVideoUrl: 'https://example.com/source.mp4',
          user: 'user-1',
        }),
        organizationId: 'org-1',
        readiness: expect.objectContaining({
          state: 'pending',
          terminal: false,
        }),
        status: 'pending',
      }),
    });
  });

  it('merges patch config and adds terminal readiness for completed projects', async () => {
    prisma.clipProject.findFirst.mockResolvedValue({
      config: {
        highlights: [{ id: 'h-1' }],
        name: 'Existing',
      },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 40,
      readiness: {},
      status: 'generating',
    });
    prisma.clipProject.update.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 100,
      readiness: {},
      status: 'completed',
    });

    await service.patch('legacy-project-id', {
      error: null,
      progress: 100,
      readyClipCount: 2,
      status: 'completed',
    });

    expect(prisma.clipProject.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'legacy-project-id' }, { mongoId: 'legacy-project-id' }],
        isDeleted: false,
      },
    });
    expect(prisma.clipProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          highlights: [{ id: 'h-1' }],
          name: 'Existing',
        }),
        error: null,
        progress: 100,
        readiness: expect.objectContaining({
          readyActions: ['download', 'edit', 'publish'],
          state: 'ready',
          terminal: true,
        }),
        readyClipCount: 2,
        status: 'completed',
        terminalAt: expect.any(Date),
      }),
      where: { id: 'project-1' },
    });
  });
});
