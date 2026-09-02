// This spec constructs ClipResultsService directly with a hand-built
// `_runtimeDataModel`/delegate fake (see createPrisma() below) rather than
// going through BaseService's getModelMeta() normalization path, so the
// real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.ClipResult this
// swap provides is never read by these assertions — only PrismaClient is.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ClipReferenceProvenance } from '@genfeedai/contracts/interfaces';
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
        ClipResult: {
          fields: [
            { name: 'id' },
            { name: 'organizationId' },
            { name: 'projectId' },
            { name: 'ingredientId' },
            { name: 'userId' },
            { name: 'providerJobId' },
            { name: 'viralityScore' },
            { name: 'status' },
            { name: 'mode' },
            { name: 'isSelected' },
            { name: 'readiness' },
            { name: 'terminalAt' },
            { name: 'data' },
            { name: 'isDeleted' },
          ],
        },
      },
    },
    clipProject: {
      findFirst: vi.fn(),
    },
    clipResult: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe('ClipResultsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: ClipResultsService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new ClipResultsService(
      prisma as unknown as PrismaService,
      createLogger(),
    );
  });

  it('maps create DTO fields to durable columns and data JSON', async () => {
    prisma.clipResult.create.mockResolvedValue({
      data: { title: 'Clip title' },
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'pending',
      userId: 'user-1',
    });

    const result = await service.create({
      clipType: 'hook',
      duration: 30,
      endTime: 45,
      index: 0,
      organizationId: 'org-1',
      projectId: 'project-1',
      startTime: 15,
      status: 'pending',
      summary: 'A compelling moment',
      tags: ['ai'],
      title: 'Clip title',
      userId: 'user-1',
      viralityScore: 88,
    } as CreateClipResultDto);

    expect(prisma.clipResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          clipType: 'hook',
          duration: 30,
          endTime: 45,
          index: 0,
          startTime: 15,
          summary: 'A compelling moment',
          tags: ['ai'],
          title: 'Clip title',
        }),
        organizationId: 'org-1',
        projectId: 'project-1',
        readiness: expect.objectContaining({
          state: 'pending',
          terminal: false,
        }),
        status: 'pending',
        userId: 'user-1',
        viralityScore: 88,
      }),
    });
    expect(result.title).toBe('Clip title');
    expect(result.userId).toBe('user-1');
  });

  it('routes mode to a durable column, not the data JSON blob', async () => {
    prisma.clipResult.create.mockResolvedValue({
      data: {},
      id: 'clip-1',
      isSelected: false,
      mode: 'raw-cut',
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'pending',
    });

    await service.create({
      duration: 30,
      endTime: 45,
      index: 0,
      mode: 'raw-cut',
      organizationId: 'org-1',
      projectId: 'project-1',
      startTime: 15,
      title: 'Raw cut',
      userId: 'user-1',
    } as unknown as CreateClipResultDto);

    const createArgs = prisma.clipResult.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown> & { data: Record<string, unknown> };
    };
    // Top-level scalar column, so it can be queried + indexed.
    expect(createArgs.data.mode).toBe('raw-cut');
    // Never duplicated into the JSON blob.
    expect(createArgs.data.data.mode).toBeUndefined();
  });

  it('rejects a scoped patch when the clip result does not exist', async () => {
    prisma.clipResult.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('missing-clip', { status: 'failed' }, [], 'org-1'),
    ).rejects.toThrow('ClipResult');

    expect(prisma.clipResult.update).not.toHaveBeenCalled();
  });

  it('persists selected-reference provenance in the result data without URLs or provider responses', async () => {
    prisma.clipResult.create.mockResolvedValue({
      data: {},
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'pending',
    });

    const referenceProvenance = {
      application: {
        mode: 'avatar',
        nativeField: 'photo_url',
        provider: 'heygen',
        state: 'applied' as const,
      },
      schemaVersion: 1 as const,
      source: {
        assetId: 'asset-frame-1',
        candidateId: 'frame-1',
        storageKey: 'ingredients/images/org-1/frame-1.jpg',
        timestampSeconds: 12.5,
      },
    } satisfies ClipReferenceProvenance;

    await service.createGenerated(
      {
        duration: 30,
        endTime: 45,
        index: 0,
        organizationId: 'org-1',
        projectId: 'project-1',
        startTime: 15,
        title: 'Referenced clip',
        userId: 'user-1',
      },
      referenceProvenance,
    );

    const createArgs = prisma.clipResult.create.mock.calls[0]?.[0] as {
      data: { data: Record<string, unknown> };
    };
    expect(createArgs.data.data.referenceProvenance).toEqual(
      referenceProvenance,
    );
    expect(
      JSON.stringify(createArgs.data.data.referenceProvenance),
    ).not.toMatch(/https?:\/\/|apiKey|providerResponse/);
  });

  it('creates an externally requested result only for a project in the organization', async () => {
    prisma.clipProject.findFirst.mockResolvedValue({ id: 'project-1' });
    prisma.clipResult.create.mockResolvedValue({
      data: { title: 'Clip title' },
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'pending',
      userId: 'user-1',
    });

    await service.createForOrganization({
      duration: 30,
      endTime: 45,
      index: 0,
      organizationId: 'org-1',
      projectId: 'project-1',
      startTime: 15,
      title: 'Clip title',
      userId: 'user-1',
    });

    expect(prisma.clipProject.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.clipResult.create).toHaveBeenCalledOnce();
  });

  it('rejects an externally requested result for a project outside the organization', async () => {
    prisma.clipProject.findFirst.mockResolvedValue(null);

    await expect(
      service.createForOrganization({
        duration: 30,
        endTime: 45,
        index: 0,
        organizationId: 'org-1',
        projectId: 'other-project',
        startTime: 15,
        title: 'Clip title',
        userId: 'user-1',
      }),
    ).rejects.toThrow('ClipProject');

    expect(prisma.clipResult.create).not.toHaveBeenCalled();
  });

  it('merges patch data and adds terminal readiness for completed clips', async () => {
    prisma.clipResult.findFirst.mockResolvedValue({
      data: {
        index: 0,
        title: 'Existing',
      },
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'extracting',
    });
    prisma.clipResult.update.mockResolvedValue({
      data: {},
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'completed',
    });

    await service.patch('requested-clip-id', {
      providerJobId: 'provider-job-1',
      status: 'completed',
      videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
    });

    expect(prisma.clipResult.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          index: 0,
          title: 'Existing',
          videoUrl: 'https://cdn.genfeed.ai/clip.mp4',
        }),
        providerJobId: 'provider-job-1',
        readiness: expect.objectContaining({
          readyActions: ['download', 'edit', 'publish'],
          state: 'ready',
          terminal: true,
        }),
        status: 'completed',
        terminalAt: expect.any(Date),
      }),
      where: { id: 'clip-1' },
    });
  });

  it('claims a matching provider terminal transition only once', async () => {
    prisma.clipResult.findFirst.mockResolvedValue({
      data: { providerName: 'argil', title: 'Existing' },
      organizationId: 'org-1',
    });
    prisma.clipResult.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.transitionProviderTerminal({
        clipResultId: 'clip-1',
        providerJobId: 'video-1',
        providerName: 'argil',
        status: 'completed',
        videoUrl: 'https://cdn.argil.ai/video-1.mp4',
      }),
    ).resolves.toBe(true);

    expect(prisma.clipResult.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: {
          providerName: 'argil',
          title: 'Existing',
          videoUrl: 'https://cdn.argil.ai/video-1.mp4',
        },
        providerJobId: 'video-1',
        readiness: expect.objectContaining({ terminal: true }),
        status: 'completed',
        terminalAt: expect.any(Date),
      }),
      where: {
        data: { equals: 'argil', path: ['providerName'] },
        id: 'clip-1',
        isDeleted: false,
        organizationId: 'org-1',
        providerJobId: 'video-1',
        status: { notIn: ['completed', 'degraded', 'failed'] },
      },
    });
  });

  it('reports a terminal replay when no nonterminal row matches', async () => {
    prisma.clipResult.findFirst.mockResolvedValue(null);

    await expect(
      service.transitionProviderTerminal({
        clipResultId: 'clip-1',
        providerJobId: 'video-1',
        providerName: 'argil',
        status: 'failed',
      }),
    ).resolves.toBe(false);

    expect(prisma.clipResult.updateMany).not.toHaveBeenCalled();
  });

  it('claims a Library ingredient only when the clip is still unlinked or already owned', async () => {
    prisma.clipResult.findFirst.mockResolvedValue({
      data: { title: 'Existing' },
    });
    prisma.clipResult.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.claimLibraryIngredient({
        clipResultId: 'clip-1',
        ingredientId: 'ingredient-1',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);

    expect(prisma.clipResult.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          libraryLinkError: null,
          libraryLinkStatus: 'linked',
        }),
        ingredientId: 'ingredient-1',
      }),
      where: {
        id: 'clip-1',
        isDeleted: false,
        organizationId: 'org-1',
        OR: [{ ingredientId: null }, { ingredientId: 'ingredient-1' }],
      },
    });
  });

  it('scopes project lookup by organization when provided', async () => {
    prisma.clipResult.findMany.mockResolvedValue([
      {
        data: { title: 'Clip' },
        id: 'clip-1',
        isSelected: false,
        organizationId: 'org-1',
        projectId: 'project-1',
        readiness: {},
        status: 'completed',
      },
    ]);

    const result = await service.findByProject('project-1', 'org-1');

    expect(prisma.clipResult.findMany).toHaveBeenCalledWith({
      orderBy: { viralityScore: 'desc' },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        projectId: 'project-1',
      },
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'clip-1',
        title: 'Clip',
      }),
    );
  });

  it('lists organization results newest first with tenant and deletion scope', async () => {
    prisma.clipResult.findMany.mockResolvedValue([]);

    await service.findRecentByOrganization('org-1');

    expect(prisma.clipResult.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('returns a bounded oldest-first set of active raw-cut clips', async () => {
    prisma.clipResult.findMany.mockResolvedValue([]);

    await service.findActiveRawCuts(25);

    expect(prisma.clipResult.findMany).toHaveBeenCalledWith({
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 25,
      where: {
        isDeleted: false,
        mode: 'raw-cut',
        status: {
          in: ['extracting', 'reframing', 'captioning', 'validating'],
        },
      },
    });
  });

  it('resolves a project clip result by id or provider job id for handoff', async () => {
    prisma.clipResult.findFirst.mockResolvedValue({
      data: { title: 'Clip' },
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {
        readyActions: ['download', 'edit', 'publish'],
        state: 'ready',
      },
      status: 'completed',
    });

    const result = await service.findProjectResultForHandoff({
      clipResultId: 'provider-job-1',
      organizationId: 'org-1',
      projectId: 'project-1',
    });

    expect(prisma.clipResult.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ id: 'provider-job-1' }, { providerJobId: 'provider-job-1' }],
        isDeleted: false,
        organizationId: 'org-1',
        projectId: 'project-1',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'clip-1',
        title: 'Clip',
      }),
    );
  });
});
