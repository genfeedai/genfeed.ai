import { AgentRunsService } from '@api/collections/agent-runs/services/agent-runs.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AgentArtifactReferenceService } from '@genfeedai/server';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentRunsService', () => {
  const agentRun = {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const artifactReferenceService = {
    resolveReference: vi.fn(),
    resolveVersionPin: vi.fn(),
  };

  let service: AgentRunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentRun.count.mockResolvedValue(0);
    agentRun.groupBy.mockResolvedValue([]);
    agentRun.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'run-1', ...data }),
    );
    agentRun.findFirst.mockResolvedValue(null);
    agentRun.findMany.mockResolvedValue([]);
    agentRun.update.mockResolvedValue({ id: 'run-1' });
    agentRun.updateMany.mockResolvedValue({ count: 1 });
    agentRun.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ ...create }),
    );
    artifactReferenceService.resolveReference.mockImplementation((reference) =>
      Promise.resolve({ reference }),
    );
    artifactReferenceService.resolveVersionPin.mockResolvedValue({
      reference: {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-from-pin',
        serializer: 'post',
      },
    });

    service = new AgentRunsService(
      { agentRun } as unknown as PrismaService,
      logger as unknown as LoggerService,
      artifactReferenceService as unknown as AgentArtifactReferenceService,
    );
  });

  it('queries active runs with Prisma enum values and a slim select', async () => {
    await service.getActiveRuns('org-1');

    expect(agentRun.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: expect.objectContaining({
        id: true,
        status: true,
        label: true,
      }),
      take: 50,
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        status: {
          in: ['PENDING', 'RUNNING'],
        },
      },
    });
  });

  it('lists recent runs with a slim select for bootstrap', async () => {
    await service.listRecentRuns('org-1', 20);

    expect(agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          status: true,
          progress: true,
        }),
        take: 20,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    // Heavy JSON columns must not be pulled on the shell overview path.
    const arg = agentRun.findMany.mock.calls[0]?.[0] as {
      select?: Record<string, boolean>;
    };
    expect(arg.select?.result).toBeUndefined();
    expect(arg.select?.toolCalls).toBeUndefined();
    expect(arg.select?.steps).toBeUndefined();
    expect(arg.select?.config).toBeUndefined();
  });

  it('scopes active runs by brand when provided', async () => {
    await service.getActiveRuns('org-1', { brandId: 'brand-1' });

    expect(agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
      }),
    );
  });

  it('finds runs with canonical IDs and organization scope', async () => {
    agentRun.findFirst.mockResolvedValue({ id: 'run-1' });

    await service.findOne({ id: 'run-1', organizationId: 'org-1' });

    expect(agentRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('caps active runs and applies cursor dates', async () => {
    await service.getActiveRuns('org-1', {
      cursor: '2026-06-01T10:00:00.000Z',
      limit: 999,
    });

    expect(agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 200,
        where: expect.objectContaining({
          createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') },
        }),
      }),
    );
  });

  it('aggregates run stats with two status groupBy queries', async () => {
    agentRun.groupBy = vi.fn().mockResolvedValue([]);

    await service.getStats('org-1');

    expect(agentRun.groupBy).toHaveBeenCalledTimes(2);
    expect(agentRun.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['status'],
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(agentRun.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        by: ['status'],
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
          status: {
            in: ['COMPLETED', 'FAILED'],
          },
        }),
      }),
    );
    expect(agentRun.count).not.toHaveBeenCalled();
  });

  it('persists canonical relation IDs on create', async () => {
    await service.create({
      brandId: 'brand-1',
      creditBudget: 50,
      label: 'Run',
      metadata: { source: 'test' },
      objective: 'Do the thing',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      trigger: 'manual' as never,
      userId: 'user-1',
    });

    expect(agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        brandId: 'brand-1',
        creditBudget: 50,
        organizationId: 'org-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      }),
    });
  });

  it('atomically records one organization-scoped failed attempt with its thread', async () => {
    const failure =
      'Provider authentication failed: The model provider rejected the credentials for this request.';

    await service.recordFailedAttempt(
      'attempt-1',
      {
        label: 'Failed run',
        organizationId: 'org-1',
        threadId: 'thread-1',
        trigger: 'manual',
        userId: 'user-1',
      } as never,
      failure,
    );

    expect(agentRun.create).not.toHaveBeenCalled();
    expect(agentRun.upsert).toHaveBeenCalledOnce();
    expect(agentRun.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        completedAt: expect.any(Date),
        durationMs: 0,
        error: failure,
        id: 'attempt-1',
        isDeleted: false,
        organizationId: 'org-1',
        retryCount: 1,
        status: 'FAILED',
        threadId: 'thread-1',
        userId: 'user-1',
      }),
      update: expect.objectContaining({
        completedAt: expect.any(Date),
        durationMs: 0,
        error: failure,
        isDeleted: false,
        retryCount: 1,
        status: 'FAILED',
      }),
      where: {
        id: 'attempt-1',
        organizationId: 'org-1',
      },
    });
    expect(agentRun.upsert.mock.calls[0][0].where).not.toHaveProperty(
      'isDeleted',
    );
  });

  it('matches a soft-deleted unique row and restores it instead of creating', async () => {
    const existing = {
      error: 'stale',
      id: 'attempt-tombstone',
      isDeleted: true,
      organizationId: 'org-1',
      status: 'CANCELLED',
    };
    let created = false;
    let updated = false;

    agentRun.upsert.mockImplementation(
      async (args: {
        create: { id: string; isDeleted: boolean; organizationId: string };
        update: { isDeleted: boolean };
        where: { id?: string; isDeleted?: boolean; organizationId?: string };
      }) => {
        const uniqueMatches =
          args.where.id === existing.id &&
          args.where.organizationId === existing.organizationId;
        const softDeleteFilterBlocks =
          args.where.isDeleted !== undefined &&
          args.where.isDeleted !== existing.isDeleted;

        if (uniqueMatches && !softDeleteFilterBlocks) {
          updated = true;
          return { ...existing, ...args.update };
        }

        if (uniqueMatches) {
          throw new Error('Unique constraint failed on the fields: (`id`)');
        }

        created = true;
        return args.create;
      },
    );

    const result = await service.recordFailedAttempt(
      'attempt-tombstone',
      {
        label: 'Retry restore',
        organizationId: 'org-1',
        threadId: 'thread-1',
        trigger: 'manual',
        userId: 'user-1',
      } as never,
      'retry after tombstone',
    );

    const call = agentRun.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'attempt-tombstone',
      organizationId: 'org-1',
    });
    expect(call.where).not.toHaveProperty('isDeleted');
    expect(call.update.isDeleted).toBe(false);
    expect(call.create.isDeleted).toBe(false);
    expect(updated).toBe(true);
    expect(created).toBe(false);
    expect(result.id).toBe('attempt-tombstone');
    expect(result.isDeleted).toBe(false);
  });

  it('queries failed attempts by thread and organization through existing scoped paths', async () => {
    const since = new Date('2026-08-11T00:00:00.000Z');

    await service.getByThread('thread-1', 'org-1');
    expect(agentRun.findMany).toHaveBeenNthCalledWith(1, {
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        threadId: 'thread-1',
      },
    });

    await service.findRecentByOrganization('org-1', since);
    expect(agentRun.findMany).toHaveBeenNthCalledWith(2, {
      orderBy: { createdAt: 'desc' },
      take: 200,
      where: {
        createdAt: { gte: since },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('rejects create without normalized user scope', async () => {
    await expect(
      service.create({
        label: 'Run',
        organizationId: 'org-1',
        trigger: 'manual' as never,
      } as never),
    ).rejects.toThrow('User context is required');
  });

  it('persists authorized message-equivalent references and pins on create', async () => {
    await service.create({
      brandId: 'brand-1',
      label: 'Artifact run',
      metadata: {
        artifactReferences: [
          {
            kind: 'post',
            organizationId: 'foreign-org',
            recordId: 'post-1',
            serializer: 'asset',
          },
        ],
        artifactVersionPinIds: ['pin-1'],
      },
      organizationId: 'org-1',
      trigger: 'manual' as never,
      userId: 'user-1',
    });

    expect(artifactReferenceService.resolveReference).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        kind: 'post',
        organizationId: 'org-1',
        recordId: 'post-1',
        serializer: 'post',
      },
      { brandId: 'brand-1', organizationId: 'org-1' },
    );
    expect(agentRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: [
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-1',
            serializer: 'post',
          },
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-from-pin',
            serializer: 'post',
          },
        ],
        artifactVersionPinIds: ['pin-1'],
      }),
    });
  });

  it('authorizes explicit references from patch metadata in persisted run scope', async () => {
    agentRun.findFirst.mockResolvedValue({
      artifactReferences: [
        {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-existing',
          serializer: 'post',
        },
      ],
      artifactVersionPinIds: ['pin-1'],
      brandId: 'brand-1',
      id: 'run-1',
      organizationId: 'org-1',
    });

    await service.patch('run-1', {
      metadata: {
        artifactReferences: [
          {
            kind: 'ingredient',
            organizationId: 'foreign-org',
            recordId: 'ingredient-1',
            serializer: 'post',
          },
        ],
      },
    });

    expect(agentRun.findFirst).toHaveBeenCalledWith({
      select: {
        artifactReferences: true,
        artifactVersionPinIds: true,
        brandId: true,
        id: true,
        organizationId: true,
      },
      where: { id: 'run-1', isDeleted: false },
    });
    expect(agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: expect.arrayContaining([
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-existing',
            serializer: 'post',
          },
          {
            brandId: 'brand-1',
            kind: 'ingredient',
            organizationId: 'org-1',
            recordId: 'ingredient-1',
            serializer: 'ingredient',
          },
          {
            brandId: 'brand-1',
            kind: 'post',
            organizationId: 'org-1',
            recordId: 'post-from-pin',
            serializer: 'post',
          },
        ]),
        artifactVersionPinIds: ['pin-1'],
      }),
      where: { id: 'run-1' },
    });
  });

  it('merges newly authorized references with references already on the run', async () => {
    agentRun.findFirst.mockResolvedValue({
      artifactReferences: [
        {
          brandId: 'brand-1',
          kind: 'post',
          organizationId: 'org-1',
          recordId: 'post-1',
          serializer: 'post',
        },
      ],
      artifactVersionPinIds: ['pin-1'],
      brandId: 'brand-1',
      id: 'run-1',
      metadata: { existing: true },
      organizationId: 'org-1',
    });

    await service.mergeMetadata('run-1', 'org-1', {
      artifactReferences: [
        {
          kind: 'ingredient',
          organizationId: 'org-1',
          recordId: 'ingredient-1',
          serializer: 'ingredient',
        },
      ],
      source: 'completion',
    });

    expect(agentRun.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artifactReferences: expect.arrayContaining([
          expect.objectContaining({ kind: 'post', recordId: 'post-1' }),
          expect.objectContaining({
            kind: 'ingredient',
            recordId: 'ingredient-1',
          }),
          expect.objectContaining({
            kind: 'post',
            recordId: 'post-from-pin',
          }),
        ]),
        artifactVersionPinIds: ['pin-1'],
        metadata: expect.objectContaining({
          existing: true,
          source: 'completion',
        }),
      }),
      where: { id: 'run-1' },
    });
  });

  it('records tool calls on the durable JSON column with an ISO timestamp', async () => {
    agentRun.findFirst.mockResolvedValue({
      id: 'run-1',
      toolCalls: [{ status: 'completed', toolName: 'existing' }],
    });

    await service.recordToolCall('run-1', 'org-1', {
      creditsUsed: 3,
      durationMs: 120,
      status: 'completed',
      toolName: 'generate_post',
    });

    expect(agentRun.update).toHaveBeenCalledWith({
      data: {
        creditsUsed: { increment: 3 },
        toolCalls: [
          { status: 'completed', toolName: 'existing' },
          expect.objectContaining({
            creditsUsed: 3,
            durationMs: 120,
            status: 'completed',
            toolName: 'generate_post',
          }),
        ],
      },
      where: { id: 'run-1' },
    });

    const appendedCall = agentRun.update.mock.calls[0]?.[0].data.toolCalls[1];
    expect(appendedCall.executedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(appendedCall.executedAt))).toBe(false);
  });

  it('clamps progress before writing the durable progress column', async () => {
    await service.updateProgress('run-1', 'org-1', 150);

    expect(agentRun.updateMany).toHaveBeenCalledWith({
      data: { progress: 100 },
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  // The DRY/slop audit (§2.J) lists these org-scoped `findFirst` sites as
  // candidates, but each degrades gracefully on a miss (returns null/void)
  // rather than throwing. They were intentionally NOT converted to
  // `findOrThrow`; these lock that decision in so a future sweep does not
  // silently turn a soft miss into a 404. `agentRun.findFirst` defaults to
  // resolving `null` (missing / foreign / soft-deleted row).
  describe('optional lookups stay optional (findOrThrow intentionally not adopted)', () => {
    it('getById returns null instead of throwing when no row matches', async () => {
      await expect(service.getById('run-x', 'org-1')).resolves.toBeNull();
    });

    it('recordToolCall returns silently and does not write when the run is missing', async () => {
      await expect(
        service.recordToolCall('run-x', 'org-1', {
          creditsUsed: 1,
          durationMs: 10,
          status: 'completed',
          toolName: 'noop',
        }),
      ).resolves.toBeUndefined();
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('mergeMetadata returns silently and does not write when the run is missing', async () => {
      await expect(
        service.mergeMetadata('run-x', 'org-1', { k: 'v' }),
      ).resolves.toBeUndefined();
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('complete returns null and does not write when the run is missing', async () => {
      await expect(service.complete('run-x', 'org-1')).resolves.toBeNull();
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('fail returns null and does not write when the run is missing', async () => {
      await expect(service.fail('run-x', 'org-1', 'boom')).resolves.toBeNull();
      expect(agentRun.update).not.toHaveBeenCalled();
    });

    it('cancel returns null and does not write when the run is missing', async () => {
      await expect(service.cancel('run-x', 'org-1')).resolves.toBeNull();
      expect(agentRun.update).not.toHaveBeenCalled();
    });
  });

  describe('prepareRetry', () => {
    const failedRun = {
      completedAt: new Date('2026-07-09T11:00:00.000Z'),
      creditBudget: 40,
      durationMs: 60000,
      error: 'original failure',
      id: 'run-1',
      metadata: {
        campaignId: 'campaign-1',
        requestedModel: 'model-from-metadata',
        source: 'test',
      },
      objective: 'Do the thing',
      progress: 70,
      retryCount: 1,
      startedAt: new Date('2026-07-09T10:59:00.000Z'),
      status: 'FAILED',
      strategy: {
        agentType: 'content',
        config: { autonomyMode: 'supervised', model: 'model-from-config' },
      },
      strategyId: 'strategy-1',
      summary: 'partial output',
      threadId: 'thread-1',
      userId: 'user-1',
    };

    it('returns null when the run is not found', async () => {
      agentRun.findFirst.mockResolvedValue(null);

      const preparation = await service.prepareRetry('missing', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation).toBeNull();
      expect(agentRun.updateMany).not.toHaveBeenCalled();
    });

    it('scopes the lookup by organization and brand', async () => {
      agentRun.findFirst.mockResolvedValue(null);

      await service.prepareRetry('run-1', 'org-1', {
        brandId: 'brand-1',
        retriedBy: 'user-2',
      });

      expect(agentRun.findFirst).toHaveBeenCalledWith({
        include: { strategy: true },
        where: {
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('rejects runs that are not failed or cancelled', async () => {
      agentRun.findFirst.mockResolvedValue({
        ...failedRun,
        status: 'RUNNING',
      });

      await expect(
        service.prepareRetry('run-1', 'org-1', { retriedBy: 'user-2' }),
      ).rejects.toThrow('Only failed or cancelled agent runs can be retried');
      expect(agentRun.updateMany).not.toHaveBeenCalled();
    });

    it('resets terminal state and stamps retry provenance metadata', async () => {
      agentRun.findFirst.mockResolvedValue(failedRun);

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.previousStatus).toBe('FAILED');
      expect(agentRun.updateMany).toHaveBeenCalledWith({
        data: {
          completedAt: null,
          durationMs: null,
          error: null,
          metadata: expect.objectContaining({
            campaignId: 'campaign-1',
            lastRetryAt: expect.any(String),
            retriedBy: 'user-2',
            source: 'test',
          }),
          progress: 0,
          startedAt: null,
          status: 'PENDING',
          summary: null,
          updatedAt: expect.any(Date),
        },
        where: {
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'FAILED',
        },
      });

      const writtenMetadata =
        agentRun.updateMany.mock.calls[0]?.[0].data.metadata;
      expect(Number.isNaN(Date.parse(writtenMetadata.lastRetryAt))).toBe(false);
      expect(preparation?.rollback.state).toEqual({
        completedAt: failedRun.completedAt,
        durationMs: 60000,
        error: 'original failure',
        metadata: failedRun.metadata,
        progress: 70,
        startedAt: failedRun.startedAt,
        status: 'FAILED',
        summary: 'partial output',
      });
    });

    it('rejects a concurrent retry after another request claims the run', async () => {
      agentRun.findFirst.mockResolvedValue(failedRun);
      agentRun.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.prepareRetry('run-1', 'org-1', { retriedBy: 'user-2' }),
      ).rejects.toThrow('Agent run retry is already in progress');
    });

    it('rebuilds queue job data from the durable run and strategy records', async () => {
      agentRun.findFirst.mockResolvedValue(failedRun);

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.jobData).toEqual({
        agentType: 'content',
        autonomyMode: 'supervised',
        campaignId: 'campaign-1',
        creditBudget: 40,
        model: 'model-from-metadata',
        objective: 'Do the thing',
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: 'strategy-1',
        userId: 'user-1',
      });
    });

    it('falls back to strategy config model and omits absent fields for cancelled runs', async () => {
      agentRun.findFirst.mockResolvedValue({
        id: 'run-1',
        metadata: null,
        status: 'CANCELLED',
        strategy: { agentType: null, config: { model: 'model-from-config' } },
        userId: 'user-1',
      });

      const preparation = await service.prepareRetry('run-1', 'org-1', {
        retriedBy: 'user-2',
      });

      expect(preparation?.previousStatus).toBe('CANCELLED');
      expect(preparation?.jobData).toEqual({
        agentType: undefined,
        autonomyMode: undefined,
        campaignId: undefined,
        creditBudget: undefined,
        model: 'model-from-config',
        objective: undefined,
        organizationId: 'org-1',
        runId: 'run-1',
        strategyId: undefined,
        userId: 'user-1',
      });
    });
  });

  describe('rollbackRetry', () => {
    it('restores the prior state only for the claimed tenant-scoped retry', async () => {
      const claimedAt = new Date('2026-07-10T00:00:00.000Z');
      const state = {
        error: 'original failure',
        status: 'FAILED',
      };

      await expect(
        service.rollbackRetry(
          'run-1',
          'org-1',
          { claimedAt, state },
          'brand-1',
        ),
      ).resolves.toBe(true);

      expect(agentRun.updateMany).toHaveBeenCalledWith({
        data: state,
        where: {
          brandId: 'brand-1',
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: 'PENDING',
          updatedAt: claimedAt,
        },
      });
    });
  });
});
