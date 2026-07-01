// This spec constructs ClipProjectsService directly with a hand-built
// `_runtimeDataModel`/delegate fake (see createPrisma() below) rather than
// going through BaseService's getModelMeta() normalization path, so the
// real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.ClipProject this
// swap provides is never read by these assertions — only PrismaClient is.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { CreateClipProjectDto } from '@api/collections/clip-projects/dto/create-clip-project.dto';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
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
  let clipResultsService: { findByProject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrisma();
    clipResultsService = {
      findByProject: vi.fn(),
    };
    service = new ClipProjectsService(
      prisma as unknown as PrismaService,
      createLogger(),
      clipResultsService as unknown as ClipResultsService,
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

  it('reconciles project terminal state from completed and failed clip results', async () => {
    prisma.clipProject.findFirst.mockResolvedValue({
      config: {},
      failedClipCount: 0,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 2,
      progress: 50,
      readyClipCount: 0,
      readiness: {},
      status: 'generating',
    });
    prisma.clipProject.update.mockResolvedValue({
      config: {},
      failedClipCount: 1,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 0,
      progress: 100,
      readyClipCount: 1,
      readiness: {},
      status: 'completed',
    });
    clipResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'failed' },
    ]);

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(clipResultsService.findByProject).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
    expect(prisma.clipProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: null,
        failedClipCount: 1,
        pendingClipCount: 0,
        progress: 100,
        readyClipCount: 1,
        readiness: expect.objectContaining({
          readyActions: ['download', 'edit', 'publish'],
          state: 'ready',
        }),
        status: 'completed',
      }),
      where: { id: 'project-1' },
    });
  });

  it('keeps project non-terminal while child clips are still pending', async () => {
    prisma.clipProject.findFirst.mockResolvedValue({
      config: {},
      failedClipCount: 0,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 2,
      progress: 25,
      readyClipCount: 0,
      readiness: {},
      status: 'generating',
    });
    clipResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'extracting' },
    ]);

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(prisma.clipProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        failedClipCount: 0,
        pendingClipCount: 1,
        readyClipCount: 1,
      }),
      where: { id: 'project-1' },
    });
  });
});
