vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import type { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { AgentRoomDocument } from '@api/collections/agent-threads/schemas/agent-thread.schema';
import { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

type AgentThreadDelegate = {
  count: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type FindManyArgs = {
  orderBy?: Array<Record<string, unknown>>;
  skip?: number;
  take?: number;
  where?: Record<string, unknown>;
};

const FIRST_PAGE = { limit: 50, page: 1, skip: 0 };

describe('AgentThreadsService Prisma row contract', () => {
  let brandDelegate: { findMany: ReturnType<typeof vi.fn> };
  let delegate: AgentThreadDelegate;
  let ingredientDelegate: { findMany: ReturnType<typeof vi.fn> };
  let queryRaw: ReturnType<typeof vi.fn>;
  let snapshotDelegate: { findMany: ReturnType<typeof vi.fn> };
  let service: AgentThreadsService;

  beforeEach(() => {
    brandDelegate = { findMany: vi.fn().mockResolvedValue([]) };
    delegate = {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };
    ingredientDelegate = { findMany: vi.fn().mockResolvedValue([]) };
    queryRaw = vi.fn().mockResolvedValue([]);
    snapshotDelegate = { findMany: vi.fn().mockResolvedValue([]) };

    service = new AgentThreadsService(
      {
        $queryRaw: queryRaw,
        agentThread: delegate,
        agentThreadSnapshot: snapshotDelegate,
        brand: brandDelegate,
        ingredient: ingredientDelegate,
      } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      {
        copyMessages: vi.fn(),
      } as unknown as AgentMessagesService,
    );
  });

  it('keeps canonical relation ids required', () => {
    expectTypeOf<
      Pick<AgentRoomDocument, 'organizationId' | 'userId'>
    >().toEqualTypeOf<{
      organizationId: string;
      userId: string;
    }>();
  });

  it('narrows the thread query to a single entry point when source is set', async () => {
    await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      undefined,
      'onboarding',
      FIRST_PAGE,
    );

    const call = delegate.findMany.mock.calls[0]?.[0] as FindManyArgs;
    expect(call.where).toEqual(
      expect.objectContaining({
        isDeleted: false,
        organizationId: 'org-1',
        source: 'onboarding',
        status: AgentThreadStatus.ACTIVE,
        userId: 'user-1',
      }),
    );
    expect(call.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    // The source filter runs in the database, so the newest onboarding thread
    // is on page one however many newer standard threads exist.
    expect(call.take).toBe(50);
    expect(call.skip).toBe(0);
  });

  it('pages threads in the database and reports the total', async () => {
    delegate.findMany.mockResolvedValue([
      { id: 'thread-3', organizationId: 'org-1', userId: 'user-1' },
    ]);
    delegate.count.mockResolvedValue(101);

    const result = await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      'brand-1',
      undefined,
      { limit: 50, page: 3, skip: 100 },
    );

    const call = delegate.findMany.mock.calls[0]?.[0] as FindManyArgs;
    expect(call.skip).toBe(100);
    expect(call.take).toBe(50);
    expect(delegate.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        brandId: 'brand-1',
        isDeleted: false,
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    });
    // Snapshots, executions and brand labels are only looked up for the page.
    expect(snapshotDelegate.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ threadId: { in: ['thread-3'] } }),
    });
    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      limit: 50,
      page: 3,
      totalDocs: 101,
      totalPages: 3,
    });
  });

  it('does not load snapshots when the page is empty', async () => {
    const result = await service.getUserThreads(
      'user-1',
      'org-1',
      undefined,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    expect(result.docs).toEqual([]);
    expect(snapshotDelegate.findMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('leaves the thread query unfiltered by source when source is omitted', async () => {
    await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    const call = delegate.findMany.mock.calls[0]?.[0] as FindManyArgs;
    expect(call.where).not.toHaveProperty('source');
  });

  it('returns the canonical delegate update row unchanged', async () => {
    const barePrismaRow = {
      id: 'thread-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    delegate.update.mockResolvedValue(barePrismaRow);

    const result = await service.updateThreadMetadata('thread-1', 'org-1', {
      title: 'Renamed thread',
    });

    expect(delegate.update).toHaveBeenCalledWith({
      data: { title: 'Renamed thread' },
      where: {
        id: 'thread-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(result).toBe(barePrismaRow);
    expect(result.organizationId).toBe('org-1');
    expect(result.userId).toBe('user-1');
  });

  it('attaches brand labels and the latest generated asset to listed threads', async () => {
    delegate.findMany.mockResolvedValue([
      {
        brandId: 'brand-curie',
        id: 'thread-1',
        organizationId: 'org-1',
        title: 'Curie shoot',
        userId: 'user-1',
      },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        data: {
          lastAssistantMessage: {
            content: 'Three portraits are ready',
            createdAt: '2026-08-19T12:00:00.000Z',
            metadata: {},
          },
        },
        threadId: 'thread-1',
      },
    ]);
    // `threadId` is not a column: the service projects it out of the execution
    // `result` JSON, so the raw join result is what maps assets back to threads.
    queryRaw.mockResolvedValue([
      { id: 'execution-1', status: 'COMPLETED', threadId: 'thread-1' },
    ]);
    ingredientDelegate.findMany.mockResolvedValue([
      {
        category: 'IMAGE',
        cdnUrl: 'https://cdn.test/portrait.png',
        createdAt: new Date('2026-08-19T11:00:00.000Z'),
        workflowExecutionId: 'execution-1',
      },
    ]);
    brandDelegate.findMany.mockResolvedValue([
      { id: 'brand-curie', label: 'Curie' },
    ]);

    const result = await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    expect(ingredientDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
          workflowExecutionId: { in: ['execution-1'] },
        }),
      }),
    );
    expect(result.docs[0]).toEqual(
      expect.objectContaining({
        brandLabel: 'Curie',
        lastAssistantPreview: 'Three portraits are ready',
        lastGeneratedAssetUrl: 'https://cdn.test/portrait.png',
      }),
    );
  });

  it('looks executions up through the indexed jsonb thread path', async () => {
    delegate.findMany.mockResolvedValue([
      { id: 'thread-1', organizationId: 'org-1', userId: 'user-1' },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([]);

    await service.getUserThreads(
      'user-1',
      'org-1',
      undefined,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    const [strings, ...values] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');

    // `workflow_executions_agent_thread_lookup_idx` indexes the `#>` jsonb
    // path; a `->>` text predicate cannot use it and scans every execution.
    expect(sql).toContain("execution.result #> '{metadata,threadId}'::text[]");
    expect(sql).not.toMatch(/->> 'threadId' IN/);
    expect(JSON.stringify(values)).toContain('thread-1');
  });

  it('falls back to the latest meaningful timeline response for list previews', async () => {
    delegate.findMany.mockResolvedValue([
      {
        id: 'thread-1',
        organizationId: 'org-1',
        title: 'Publish-ready post',
        userId: 'user-1',
      },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        data: {
          lastAssistantMessage: {
            content: '   ',
            createdAt: '2026-08-19T12:05:00.000Z',
            metadata: {},
          },
          timeline: [
            {
              createdAt: '2026-08-19T12:00:00.000Z',
              detail: 'Your publish-ready draft is complete.',
              kind: 'assistant',
            },
            {
              createdAt: '2026-08-19T12:05:00.000Z',
              detail: '   ',
              kind: 'assistant',
            },
          ],
        },
        threadId: 'thread-1',
      },
    ]);

    const result = await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    expect(result.docs[0]).toEqual(
      expect.objectContaining({
        lastActivityAt: '2026-08-19T12:00:00.000Z',
        lastAssistantPreview: 'Your publish-ready draft is complete.',
      }),
    );
  });

  it('never projects a terminal workflow execution as running', async () => {
    delegate.findMany.mockResolvedValue([
      {
        id: 'thread-1',
        organizationId: 'org-1',
        title: 'Finished turn',
        userId: 'user-1',
      },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        data: {
          activeRun: {
            runId: 'run-1',
            status: 'running',
          },
        },
        threadId: 'thread-1',
      },
    ]);
    queryRaw.mockResolvedValue([
      { id: 'execution-1', status: 'COMPLETED', threadId: 'thread-1' },
    ]);

    const result = await service.getUserThreads(
      'user-1',
      'org-1',
      AgentThreadStatus.ACTIVE,
      undefined,
      undefined,
      FIRST_PAGE,
    );

    expect(result.docs[0]).toEqual(
      expect.objectContaining({
        runStatus: 'completed',
        runtimeState: 'completed',
      }),
    );
  });

  it('lists awaiting and failed runs without idle threads', async () => {
    delegate.findMany.mockResolvedValue([
      {
        id: 'thread-wait',
        lastActivityAt: new Date().toISOString(),
        organizationId: 'org-1',
        title: 'Waiting',
        userId: 'user-1',
      },
      {
        id: 'thread-idle',
        organizationId: 'org-1',
        title: 'Idle',
        userId: 'user-1',
      },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        data: {
          activeRun: { runId: 'run-wait', status: 'running' },
          pendingInputRequests: [
            { prompt: 'Pick a format', requestId: 'input-1', title: 'Format' },
          ],
        },
        threadId: 'thread-wait',
      },
      {
        data: { activeRun: { runId: 'run-idle', status: 'completed' } },
        threadId: 'thread-idle',
      },
    ]);

    const runs = await service.listAgentRuns('user-1', 'org-1', undefined, 50);

    expect(runs).toEqual([
      expect.objectContaining({
        id: 'run-wait',
        inputRequestId: 'input-1',
        runtimeState: 'awaiting_input',
        threadId: 'thread-wait',
      }),
    ]);
  });
  it('scans active threads in batches and stops once the limit is filled', async () => {
    const batch = (prefix: string) =>
      Array.from({ length: 50 }, (_, index) => ({
        id: `${prefix}-${index}`,
        organizationId: 'org-1',
        userId: 'user-1',
      }));
    delegate.findMany
      .mockResolvedValueOnce(batch('first'))
      .mockResolvedValueOnce(batch('second'));
    snapshotDelegate.findMany.mockImplementation(
      async ({ where }: { where: { threadId: { in: string[] } } }) =>
        where.threadId.in.map((threadId) => ({
          data: { activeRun: { runId: `run-${threadId}`, status: 'running' } },
          threadId,
        })),
    );

    const runs = await service.listAgentRuns('user-1', 'org-1', undefined, 60);

    expect(runs).toHaveLength(60);
    expect(delegate.findMany).toHaveBeenCalledTimes(2);
    expect(
      (delegate.findMany.mock.calls[1]?.[0] as FindManyArgs | undefined)?.skip,
    ).toBe(50);
    expect(delegate.findMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AgentThreadStatus.ACTIVE,
          userId: 'user-1',
        }),
      }),
    );
    // Run rows need neither thumbnails nor every thread's brand name.
    expect(ingredientDelegate.findMany).not.toHaveBeenCalled();
  });

  it('labels only the returned runs with their brand', async () => {
    delegate.findMany.mockResolvedValue([
      {
        brandId: 'brand-curie',
        id: 'thread-1',
        organizationId: 'org-1',
        userId: 'user-1',
      },
      {
        brandId: 'brand-idle',
        id: 'thread-idle',
        organizationId: 'org-1',
        userId: 'user-1',
      },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        data: { activeRun: { runId: 'run-1', status: 'running' } },
        threadId: 'thread-1',
      },
      {
        data: { activeRun: { runId: 'run-idle', status: 'completed' } },
        threadId: 'thread-idle',
      },
    ]);
    brandDelegate.findMany.mockResolvedValue([
      { id: 'brand-curie', label: 'Curie' },
    ]);

    const runs = await service.listAgentRuns('user-1', 'org-1', undefined, 50);

    expect(runs).toEqual([
      expect.objectContaining({ brandId: 'brand-curie', brandLabel: 'Curie' }),
    ]);
    expect(brandDelegate.findMany).toHaveBeenCalledTimes(1);
    expect(brandDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['brand-curie'] } }),
      }),
    );
  });

  it('lists an accepted queued execution before a snapshot exists', async () => {
    delegate.findMany.mockResolvedValue([
      { id: 'thread-queued', organizationId: 'org-1', userId: 'user-1' },
    ]);
    queryRaw.mockResolvedValue([
      {
        id: 'execution-new',
        status: 'PENDING',
        threadId: 'thread-queued',
        createdAt: new Date(),
      },
    ]);
    const runs = await service.listAgentRuns('user-1', 'org-1', undefined, 50);
    expect(runs).toEqual([
      expect.objectContaining({
        id: 'execution-new',
        threadId: 'thread-queued',
        runtimeState: 'running',
      }),
    ]);
  });

  it('does not let the previous failed run hide a newer queued execution', async () => {
    delegate.findMany.mockResolvedValue([
      { id: 'thread-queued', organizationId: 'org-1', userId: 'user-1' },
    ]);
    snapshotDelegate.findMany.mockResolvedValue([
      {
        threadId: 'thread-queued',
        data: { activeRun: { runId: 'execution-old', status: 'failed' } },
      },
    ]);
    queryRaw.mockResolvedValue([
      {
        id: 'execution-new',
        status: 'PENDING',
        threadId: 'thread-queued',
        createdAt: new Date(),
      },
    ]);
    const runs = await service.listAgentRuns('user-1', 'org-1', undefined, 50);
    expect(runs).toEqual([
      expect.objectContaining({ id: 'execution-new', runtimeState: 'running' }),
    ]);
  });
  it.each(['FAILED', 'CANCELLED'])(
    'does not surface stale decisions after durable %s',
    async (status) => {
      delegate.findMany.mockResolvedValue([
        { id: 'thread-stopped', organizationId: 'org-1', userId: 'user-1' },
      ]);
      snapshotDelegate.findMany.mockResolvedValue([
        {
          threadId: 'thread-stopped',
          data: {
            activeRun: { runId: 'execution-stopped', status: 'running' },
            pendingInputRequests: [
              { requestId: 'obsolete', title: 'Old question' },
            ],
            latestProposedPlan: { awaitingApproval: true },
          },
        },
      ]);
      queryRaw.mockResolvedValue([
        {
          id: 'execution-stopped',
          status,
          threadId: 'thread-stopped',
          createdAt: new Date(),
        },
      ]);
      const threads = await service.getUserThreads(
        'user-1',
        'org-1',
        AgentThreadStatus.ACTIVE,
        undefined,
        undefined,
        FIRST_PAGE,
      );
      expect(threads.docs[0]).toMatchObject({
        runtimeState: status.toLowerCase(),
        pendingInputCount: 0,
        attentionState: null,
      });
    },
  );
});
