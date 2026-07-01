vi.mock('@genfeedai/prisma', () => ({
  PrismaClient: class {},
  getModelMeta: () => ({
    allFields: [
      'id',
      'mongoId',
      'organizationId',
      'projectId',
      'providerJobId',
      'viralityScore',
      'status',
      'isSelected',
      'readiness',
      'terminalAt',
      'data',
      'isDeleted',
    ],
    enumFields: {},
  }),
}));

import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { CreateClipResultDto } from '@api/collections/clip-results/dto/create-clip-result.dto';
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
        ClipResult: {
          fields: [
            { name: 'id' },
            { name: 'mongoId' },
            { name: 'organizationId' },
            { name: 'projectId' },
            { name: 'providerJobId' },
            { name: 'viralityScore' },
            { name: 'status' },
            { name: 'isSelected' },
            { name: 'readiness' },
            { name: 'terminalAt' },
            { name: 'data' },
            { name: 'isDeleted' },
          ],
        },
      },
    },
    clipResult: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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
      data: {},
      id: 'clip-1',
      isSelected: false,
      organizationId: 'org-1',
      projectId: 'project-1',
      readiness: {},
      status: 'pending',
    });

    await service.create({
      clipType: 'hook',
      duration: 30,
      endTime: 45,
      index: 0,
      organization: 'org-1',
      project: 'project-1',
      startTime: 15,
      status: 'pending',
      summary: 'A compelling moment',
      tags: ['ai'],
      title: 'Clip title',
      user: 'user-1',
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
          user: 'user-1',
        }),
        organizationId: 'org-1',
        projectId: 'project-1',
        readiness: expect.objectContaining({
          state: 'pending',
          terminal: false,
        }),
        status: 'pending',
        viralityScore: 88,
      }),
    });
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

    await service.patch('legacy-clip-id', {
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
        _id: 'clip-1',
        title: 'Clip',
      }),
    );
  });

  it('resolves a project clip result by id, mongo id, or provider job id for handoff', async () => {
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
        OR: [
          { id: 'provider-job-1' },
          { mongoId: 'provider-job-1' },
          { providerJobId: 'provider-job-1' },
        ],
        isDeleted: false,
        organizationId: 'org-1',
        projectId: 'project-1',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        _id: 'clip-1',
        title: 'Clip',
      }),
    );
  });
});
