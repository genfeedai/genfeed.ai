// This spec constructs ClipperProjectsService directly with a hand-built
// `_runtimeDataModel`/delegate fake (see createPrisma() below) rather than
// going through BaseService's getModelMeta() normalization path, so the
// real, schema-derived getModelMeta/PRISMA_MODEL_METADATA.ClipperProject this
// swap provides is never read by these assertions — only PrismaClient is.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { CreateClipperProjectDto } from '@api/collections/clipper-projects/dto/create-clipper-project.dto';
import type { ClipperContinuityWorkflowService } from '@api/collections/clipper-projects/services/clipper-continuity-workflow.service';
import type { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';
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
        ClipperProject: {
          fields: [
            { name: 'id' },
            { name: 'organizationId' },
            { name: 'brandId' },
            { name: 'userId' },
            { name: 'workflowExecutionId' },
            { name: 'continuityQaStatus' },
            { name: 'continuityWorkflowExecutionId' },
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
    clipperProject: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workflowExecution: {
      findFirst: vi.fn(),
    },
  };
}

describe('ClipperProjectsService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: ClipperProjectsService;
  let clipperResultsService: { findByProject: ReturnType<typeof vi.fn> };
  let continuityWorkflow: { queueIfReady: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrisma();
    clipperResultsService = {
      findByProject: vi.fn(),
    };
    continuityWorkflow = {
      queueIfReady: vi.fn().mockResolvedValue(false),
    };
    service = new ClipperProjectsService(
      prisma as unknown as PrismaService,
      createLogger(),
      clipperResultsService as unknown as ClipperResultsService,
      continuityWorkflow as unknown as ClipperContinuityWorkflowService,
    );
  });

  it('claims source retries against the tenant and exact project version while preserving transcript config', async () => {
    const source = { retryCount: 1, status: 'queued' };
    prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });
    const updatedAt = new Date('2026-10-09T10:00:00Z');
    await expect(
      service.claimSourceRetry(
        {
          id: 'project-1',
          status: 'failed',
          updatedAt,
          source: { status: 'failed' },
          config: {
            transcriptText: 'Already transcribed.',
            source: { status: 'failed' },
          },
        } as never,
        'org-1',
        source as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith({
      data: {
        config: { transcriptText: 'Already transcribed.', source },
        error: null,
        readiness: expect.anything(),
        status: 'pending',
        terminalAt: null,
      },
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'failed',
        updatedAt,
      },
    });
  });

  describe('settleInFlightFailure', () => {
    const updatedAt = new Date('2026-10-10T10:00:00Z');
    const source = {
      fingerprint: 'sha256:source',
      retryCount: 1,
      status: 'extracting',
    };
    const stuck = {
      config: { source, transcriptText: 'Saved transcript.' },
      id: 'project-1',
      status: 'analyzing',
      updatedAt,
    };

    it('fails a stuck project with a retryable source', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue(stuck);
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.settleInFlightFailure('project-1', 'org-1', {
          fingerprint: 'sha256:source',
          retryCount: 1,
        }),
      ).resolves.toBe(true);

      expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith({
        data: {
          config: {
            source: expect.objectContaining({
              failure: {
                code: 'clip_workflow_failed',
                message: expect.stringContaining('internal error'),
                retryable: true,
              },
              retryCount: 1,
              status: 'failed',
            }),
            transcriptText: 'Saved transcript.',
          },
          error: expect.stringContaining('internal error'),
          readiness: expect.objectContaining({ state: 'failed' }),
          status: 'failed',
          terminalAt: expect.any(Date),
        },
        where: {
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'analyzing',
          updatedAt,
        },
      });
    });

    it.each([
      [
        'a newer attempt',
        stuck,
        { fingerprint: 'sha256:source', retryCount: 0 },
      ],
      ['a retried source from a job without an attempt', stuck, undefined],
      ['a finished project', { ...stuck, status: 'analyzed' }, undefined],
      ['an already failed project', { ...stuck, status: 'failed' }, undefined],
    ])('leaves %s untouched', async (_label, project, attempt) => {
      prisma.clipperProject.findFirst.mockResolvedValue(project);

      await expect(
        service.settleInFlightFailure('project-1', 'org-1', attempt),
      ).resolves.toBe(false);
      expect(prisma.clipperProject.updateMany).not.toHaveBeenCalled();
    });

    it('settles a never-retried source from a job without an attempt', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        ...stuck,
        config: { source: { ...source, retryCount: 0 } },
      });
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.settleInFlightFailure('project-1', 'org-1', undefined),
      ).resolves.toBe(true);
    });

    it('keeps a completed source once clips exist', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        ...stuck,
        config: { source: { ...source, status: 'completed' } },
        status: 'generating',
      });
      clipperResultsService.findByProject.mockResolvedValue([{ id: 'clip-1' }]);
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      await service.settleInFlightFailure('project-1', 'org-1', {
        fingerprint: 'sha256:source',
        retryCount: 1,
      });

      expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: { source: { ...source, status: 'completed' } },
            status: 'failed',
          }),
        }),
      );
    });
  });

  it('does not restore failed state once a retry worker has started', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      id: 'project-1',
      status: 'analyzing',
      config: { source: { retryCount: 1, status: 'extracting' } },
    });
    await service.releaseSourceRetry(
      { id: 'project-1', status: 'failed' } as never,
      'org-1',
      1,
    );
    expect(prisma.clipperProject.updateMany).not.toHaveBeenCalled();
  });

  it('maps create DTO fields to durable columns and config JSON', async () => {
    prisma.clipperProject.create.mockResolvedValue({
      brandId: 'brand-1',
      config: {
        language: 'en',
        name: 'Launch clip',
      },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'pending',
      userId: 'user-1',
    });

    const project = await service.create({
      brandId: 'brand-1',
      language: 'en',
      name: 'Launch clip',
      organizationId: 'org-1',
      settings: { maxClips: 3 },
      sourceVideoUrl: 'https://example.com/source.mp4',
      status: 'pending',
      userId: 'user-1',
    } as CreateClipperProjectDto);

    expect(prisma.clipperProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          language: 'en',
          name: 'Launch clip',
          settings: { maxClips: 3 },
          sourceVideoUrl: 'https://example.com/source.mp4',
        }),
        brandId: 'brand-1',
        organizationId: 'org-1',
        readiness: expect.objectContaining({
          state: 'pending',
          terminal: false,
        }),
        status: 'pending',
        userId: 'user-1',
      }),
    });
    expect(project.brandId).toBe('brand-1');
    expect(project.name).toBe('Launch clip');
  });

  it('normalizes reference-frame state into clipper-project config', async () => {
    prisma.clipperProject.create.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'pending',
    });

    await service.create({
      organizationId: 'org-1',
      referenceFrames: {
        candidates: [
          {
            diagnostics: [],
            id: ' frame-1 ',
            status: 'available',
            storageKey: 'organizations/org-1/clips/project-1/frame-1.jpg',
            timestampSeconds: 12.5,
          },
        ],
        diagnostics: [],
        schemaVersion: 1,
        selectedCandidateId: null,
        status: 'ready',
      },
      sourceVideoUrl: 'https://youtube.com/watch?v=source',
    } as CreateClipperProjectDto);

    expect(prisma.clipperProject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          referenceFrames: expect.objectContaining({
            candidates: [
              expect.objectContaining({
                id: 'frame-1',
                timestampSeconds: 12.5,
              }),
            ],
            schemaVersion: 1,
            selectedCandidateId: null,
            status: 'ready',
          }),
        }),
      }),
    });
  });

  it('normalizes reference-frame state supplied through config updates', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: { name: 'Existing' },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 45,
      readiness: {},
      status: 'analyzing',
    });
    prisma.clipperProject.update.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 45,
      readiness: {},
      status: 'analyzing',
    });

    await service.patch('project-1', {
      config: {
        referenceFrames: {
          candidates: [],
          diagnostics: [
            {
              code: 'clip_reference_unavailable',
              message: 'No source frames were available.',
              severity: 'warning',
            },
          ],
          schemaVersion: 1,
          selectedCandidateId: null,
          status: 'unavailable',
        },
      },
    });

    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          name: 'Existing',
          referenceFrames: expect.objectContaining({
            candidates: [],
            status: 'unavailable',
          }),
        }),
      }),
      where: { id: 'project-1' },
    });
  });

  it('rejects invalid reference-frame state before persistence', async () => {
    prisma.clipperProject.create.mockResolvedValue({});

    await expect(
      service.create({
        organizationId: 'org-1',
        referenceFrames: {
          candidates: [
            {
              diagnostics: [],
              id: 'frame-1',
              status: 'available',
              storageKey: '../frame-1.jpg',
              timestampSeconds: 1,
            },
          ],
          diagnostics: [],
          schemaVersion: 1,
          selectedCandidateId: 'missing-frame',
          status: 'selected',
        },
        sourceVideoUrl: 'https://youtube.com/watch?v=source',
      } as CreateClipperProjectDto),
    ).rejects.toThrow(ValidationException);

    expect(prisma.clipperProject.create).not.toHaveBeenCalled();
  });

  it('persists selection of an available project reference frame', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {
        referenceFrames: {
          candidates: [
            {
              diagnostics: [],
              id: 'frame-1',
              status: 'available',
              storageKey: 'organizations/org-1/clips/frame-1.jpg',
              timestampSeconds: 12,
            },
          ],
          diagnostics: [],
          schemaVersion: 1,
          selectedCandidateId: null,
          status: 'ready',
        },
      },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 100,
      readiness: {},
      status: 'analyzed',
    });
    prisma.clipperProject.update.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 100,
      readiness: {},
      status: 'analyzed',
    });

    await service.selectReferenceFrame('project-1', 'org-1', 'frame-1');

    expect(prisma.clipperProject.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.clipperProject.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: expect.objectContaining({
          referenceFrames: expect.objectContaining({
            selectedCandidateId: 'frame-1',
            status: 'selected',
          }),
        }),
      }),
      where: { id: 'project-1' },
    });
  });

  it('does not mutate when the selected reference frame is already persisted', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {
        referenceFrames: {
          candidates: [
            {
              diagnostics: [],
              id: 'frame-1',
              status: 'available',
              storageKey: 'organizations/org-1/clips/frame-1.jpg',
              timestampSeconds: 12,
            },
          ],
          diagnostics: [],
          schemaVersion: 1,
          selectedCandidateId: 'frame-1',
          status: 'selected',
        },
      },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 100,
      readiness: {},
      status: 'analyzed',
    });

    await service.selectReferenceFrame('project-1', 'org-1', 'frame-1');

    expect(prisma.clipperProject.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      candidateId: 'missing-frame',
      candidateStatus: 'available',
      expectedMessage: 'does not belong to this project',
      referenceFrameStatus: 'ready',
    },
    {
      candidateId: 'frame-1',
      candidateStatus: 'failed',
      expectedMessage: 'is not available',
      referenceFrameStatus: 'unavailable',
    },
  ])(
    'rejects $candidateId without mutation when the candidate is invalid',
    async ({
      candidateId,
      candidateStatus,
      expectedMessage,
      referenceFrameStatus,
    }) => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        config: {
          referenceFrames: {
            candidates: [
              {
                diagnostics: [],
                id: 'frame-1',
                status: candidateStatus,
                storageKey: 'organizations/org-1/clips/frame-1.jpg',
                timestampSeconds: 12,
              },
            ],
            diagnostics: [],
            schemaVersion: 1,
            selectedCandidateId: null,
            status: referenceFrameStatus,
          },
        },
        id: 'project-1',
        organizationId: 'org-1',
        progress: 100,
        readiness: {},
        status: 'analyzed',
      });

      await expect(
        service.selectReferenceFrame('project-1', 'org-1', candidateId),
      ).rejects.toThrow(expectedMessage);

      expect(prisma.clipperProject.update).not.toHaveBeenCalled();
    },
  );

  it('rejects projects outside the organization scope without mutation', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue(null);

    await expect(
      service.selectReferenceFrame('project-1', 'other-org', 'frame-1'),
    ).rejects.toThrow('ClipperProject');

    expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'other-org',
      },
    });
    expect(prisma.clipperProject.update).not.toHaveBeenCalled();
  });

  it('rejects a scoped patch when the project is outside the organization', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('project-1', { status: 'completed' }, [], 'other-org'),
    ).rejects.toThrow('ClipperProject');

    expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'other-org',
      },
    });
    expect(prisma.clipperProject.update).not.toHaveBeenCalled();
  });

  it('rejects a missing project for an unscoped patch without writing', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('project-1', { status: 'completed' }),
    ).rejects.toThrow('ClipperProject');

    expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        isDeleted: false,
      },
    });
    expect(prisma.clipperProject.update).not.toHaveBeenCalled();
  });

  it('does not treat an empty organization scope as an unscoped patch', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue(null);

    await expect(
      service.patch('project-1', { status: 'completed' }, [], ''),
    ).rejects.toThrow('ClipperProject');

    expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: '',
      },
    });
    expect(prisma.clipperProject.update).not.toHaveBeenCalled();
  });

  it('persists an explicit key clear when replacing stored source media with keyless media', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {
        sourceVideoS3Key: 'ingredients/videos/previous',
        sourceVideoUrl: 'https://cdn.example.com/previous',
      },
      id: 'project-1',
      organizationId: 'org-1',
      progress: 0,
      status: 'analyzed',
    });
    prisma.clipperProject.update.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
    });
    await service.patch(
      'project-1',
      {
        sourceVideoS3Key: null,
        sourceVideoUrl: 'https://provider.example.com/owned.mp4',
      },
      [],
      'org-1',
    );
    expect(prisma.clipperProject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          config: expect.objectContaining({
            sourceVideoS3Key: null,
            sourceVideoUrl: 'https://provider.example.com/owned.mp4',
          }),
        }),
      }),
    );
  });

  it('merges patch config and adds terminal readiness for completed projects', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
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
    prisma.clipperProject.update.mockResolvedValue({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      progress: 100,
      readiness: {},
      status: 'completed',
    });

    await service.patch('requested-project-id', {
      error: null,
      progress: 100,
      readyClipCount: 2,
      status: 'completed',
    });

    expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'requested-project-id',
        isDeleted: false,
      },
    });
    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
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

  it('counts a media-degraded clip as a settled retryable failure', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {},
      failedClipCount: 0,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 1,
      progress: 80,
      readyClipCount: 1,
      readiness: {},
      status: 'generating',
    });
    prisma.clipperProject.update.mockImplementation(async ({ data }) => ({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      ...data,
    }));
    clipperResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'degraded' },
    ]);

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        failedClipCount: 1,
        pendingClipCount: 0,
        readyClipCount: 1,
        status: 'partially-completed',
      }),
      where: { id: 'project-1' },
    });
  });

  it('reconciles project terminal state from completed and failed clip results', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
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
    prisma.clipperProject.update.mockResolvedValue({
      config: {},
      failedClipCount: 1,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 0,
      progress: 100,
      readyClipCount: 1,
      readiness: {},
      status: 'partially-completed',
    });
    clipperResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'failed' },
    ]);

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(clipperResultsService.findByProject).toHaveBeenCalledWith(
      'project-1',
      'org-1',
    );
    expect(prisma.clipperProject.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: '1 clip requires retry or review.',
        failedClipCount: 1,
        pendingClipCount: 0,
        progress: 100,
        readyClipCount: 1,
        readiness: expect.objectContaining({
          readyActions: ['download', 'edit', 'publish', 'retry'],
          state: 'blocked',
        }),
        status: 'partially-completed',
      }),
      where: { id: 'project-1' },
    });
    expect(continuityWorkflow.queueIfReady).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'partially-completed' }),
    );
  });

  it('keeps a clip project active while its workflow review gate is pending', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {},
      failedClipCount: 0,
      id: 'project-1',
      organizationId: 'org-1',
      pendingClipCount: 1,
      progress: 60,
      readyClipCount: 0,
      readiness: {},
      status: 'generating',
      workflowExecutionId: 'execution-1',
    });
    prisma.workflowExecution.findFirst.mockResolvedValue({
      result: {
        metadata: { pendingApproval: { nodeId: 'review-hook' } },
      },
      status: 'RUNNING',
    });
    prisma.clipperProject.update.mockImplementation(async ({ data }) => ({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      ...data,
    }));
    clipperResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
    ]);

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      select: { result: true, status: true },
      where: {
        id: 'execution-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pendingClipCount: 0,
        progress: 60,
        readyClipCount: 1,
        status: 'generating',
        terminalAt: null,
      }),
      where: { id: 'project-1' },
    });
  });

  it('keeps project non-terminal while child clips are still pending', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
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
    clipperResultsService.findByProject.mockResolvedValue([
      { status: 'completed' },
      { status: 'extracting' },
    ]);
    prisma.clipperProject.update.mockImplementation(async ({ data }) => ({
      config: {},
      id: 'project-1',
      organizationId: 'org-1',
      ...data,
    }));

    await service.reconcileTerminalState('project-1', 'org-1');

    expect(prisma.clipperProject.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        failedClipCount: 0,
        pendingClipCount: 1,
        progress: 80,
        readyClipCount: 1,
      }),
      where: { id: 'project-1' },
    });
  });

  it('atomically claims a failed-result retry inside the tenant boundary', async () => {
    prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.claimFailedResultRetry('project-1', 'org-1', 2),
    ).resolves.toBe(true);

    expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        failedClipCount: 0,
        pendingClipCount: 2,
        status: 'generating',
        terminalAt: null,
      }),
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: { in: ['failed', 'partially-completed'] },
      },
    });
  });

  it('claims a draft project exactly once', async () => {
    prisma.clipperProject.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.clipperProject.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.claimDraft('project-1', 'org-1')).resolves.toBe(true);
    await expect(service.claimDraft('project-1', 'org-1')).resolves.toBe(false);

    expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: null,
        status: 'pending',
        terminalAt: null,
      }),
      where: {
        id: 'project-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'draft',
      },
    });
  });

  describe('saveDraft', () => {
    const draftRow = {
      config: {
        draft: {
          sourceKind: 'youtube',
          updatedAt: '2026-09-01T00:00:00.000Z',
          youtubeUrl: 'https://youtu.be/old',
        },
        name: 'Clip draft',
        settings: { maxClips: 10, minViralityScore: 50, mode: 'avatar' },
      },
      id: 'project-1',
      isDeleted: false,
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'draft',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    it('merges form fields into the draft and settings while it is a draft', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue(draftRow);
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      const saved = await service.saveDraft('project-1', 'org-1', {
        maxClips: 12,
        mode: 'raw-cut',
        youtubeUrl: 'https://youtu.be/new',
      });

      expect(prisma.clipperProject.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'project-1',
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(prisma.clipperProject.updateMany).toHaveBeenCalledWith({
        data: {
          config: expect.objectContaining({
            draft: expect.objectContaining({
              sourceKind: 'youtube',
              youtubeUrl: 'https://youtu.be/new',
            }),
            name: 'Clip draft',
            settings: { maxClips: 12, minViralityScore: 50, mode: 'raw-cut' },
          }),
        },
        where: {
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'draft',
          updatedAt: draftRow.updatedAt,
        },
      });
      expect(saved.id).toBe('project-1');
    });

    it('rebuilds an autosave from a fresh read when an upload was attached first', async () => {
      const withUpload = {
        ...draftRow,
        config: {
          ...draftRow.config,
          source: { kind: 'upload', status: 'uploading' },
          sourceVideoS3Key: 'videos/ingredient-1',
        },
        updatedAt: new Date('2026-09-01T00:00:05.000Z'),
      };
      prisma.clipperProject.findFirst
        .mockResolvedValueOnce(draftRow)
        .mockResolvedValue(withUpload);
      prisma.clipperProject.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });

      await service.saveDraft('project-1', 'org-1', { maxClips: 12 });

      expect(prisma.clipperProject.updateMany).toHaveBeenCalledTimes(2);
      const retried = prisma.clipperProject.updateMany.mock.calls[1]?.[0];
      expect(retried.where.updatedAt).toEqual(withUpload.updatedAt);
      expect(retried.data.config).toMatchObject({
        settings: expect.objectContaining({ maxClips: 12 }),
        source: { kind: 'upload', status: 'uploading' },
        sourceVideoS3Key: 'videos/ingredient-1',
      });
    });

    it('refuses to edit a project that has already started', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        ...draftRow,
        status: 'analyzing',
      });

      await expect(
        service.saveDraft('project-1', 'org-1', { maxClips: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.clipperProject.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a save that loses the race with a start', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue(draftRow);
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.saveDraft('project-1', 'org-1', { maxClips: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not reveal another organization draft', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue(null);

      await expect(
        service.saveDraft('project-1', 'org-2', { maxClips: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.clipperProject.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('patchDraft', () => {
    const draftRow = {
      config: {
        draft: { filename: 'podcast.mp4', sourceKind: 'upload' },
        settings: { maxClips: 10 },
      },
      id: 'draft-1',
      isDeleted: false,
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'draft',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    it('attaches source fields while the project stays a draft', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue(draftRow);
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      await service.patchDraft('draft-1', 'org-1', {
        source: { kind: 'upload', status: 'uploading' },
        sourceVideoS3Key: 'videos/ingredient-1',
        status: 'pending',
      });

      const call = prisma.clipperProject.updateMany.mock.calls[0]?.[0];
      expect(call.where).toEqual({
        id: 'draft-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: 'draft',
        updatedAt: draftRow.updatedAt,
      });
      expect(call.data).not.toHaveProperty('status');
      expect(call.data.config).toMatchObject({
        draft: { filename: 'podcast.mp4', sourceKind: 'upload' },
        source: { kind: 'upload', status: 'uploading' },
        sourceVideoS3Key: 'videos/ingredient-1',
      });
    });

    it('keeps the saved brand when the caller omits it', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        ...draftRow,
        brandId: 'brand-1',
      });
      prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

      await service.patchDraft('draft-1', 'org-1', {
        brandId: undefined,
        name: 'Uploaded source',
      });

      const call = prisma.clipperProject.updateMany.mock.calls[0]?.[0];
      expect(call.data).not.toHaveProperty('brandId');
    });

    it('refuses a project that already started', async () => {
      prisma.clipperProject.findFirst.mockResolvedValue({
        ...draftRow,
        status: 'analyzing',
      });

      await expect(
        service.patchDraft('draft-1', 'org-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.clipperProject.updateMany).not.toHaveBeenCalled();
    });
  });

  it('returns a failed start to draft with a retryable source', async () => {
    prisma.clipperProject.findFirst.mockResolvedValue({
      config: {
        draft: { sourceKind: 'upload' },
        source: {
          jobId: 'clipper-analysis-draft-1',
          kind: 'upload',
          status: 'queued',
        },
      },
      id: 'draft-1',
      isDeleted: false,
      organizationId: 'org-1',
      progress: 0,
      readiness: {},
      status: 'pending',
    });
    prisma.clipperProject.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.releaseDraft('draft-1', 'org-1')).resolves.toBe(true);

    const call = prisma.clipperProject.updateMany.mock.calls[0]?.[0];
    expect(call.where).toEqual({
      id: 'draft-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: 'pending',
    });
    expect(call.data.status).toBe('draft');
    expect(call.data.config.source).toEqual({
      kind: 'upload',
      status: 'uploading',
    });
    expect(call.data.config.draft).toEqual({ sourceKind: 'upload' });
  });

  it('claims a draft only at the version the caller validated', async () => {
    const validatedAt = new Date('2026-09-28T10:00:00.000Z');
    prisma.clipperProject.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.claimDraft('draft-1', 'org-1', validatedAt),
    ).resolves.toBe(false);
    expect(prisma.clipperProject.updateMany.mock.calls[0]?.[0].where).toEqual({
      id: 'draft-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: 'draft',
      updatedAt: validatedAt,
    });
  });
});
