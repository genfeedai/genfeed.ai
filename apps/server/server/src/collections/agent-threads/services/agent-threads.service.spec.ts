vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@server/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { AgentThreadStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import type { AgentMessagesService } from '@server/collections/agent-messages/services/agent-messages.service';
import type { AgentRoomDocument } from '@server/collections/agent-threads/schemas/agent-thread.schema';
import { AgentThreadsService } from '@server/collections/agent-threads/services/agent-threads.service';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';

type AgentThreadDelegate = {
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type FindManyArgs = {
  orderBy?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

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
    expect(call.orderBy).toEqual({ updatedAt: 'desc' });
    // No page cap: an onboarding thread must be findable regardless of how
    // many newer standard threads sit in front of it.
    expect(call).not.toHaveProperty('take');
    expect(call).not.toHaveProperty('skip');
  });

  it('leaves the thread query unfiltered by source when source is omitted', async () => {
    await service.getUserThreads('user-1', 'org-1', AgentThreadStatus.ACTIVE);

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
    expect(result[0]).toEqual(
      expect.objectContaining({
        brandLabel: 'Curie',
        lastAssistantPreview: 'Three portraits are ready',
        lastGeneratedAssetUrl: 'https://cdn.test/portrait.png',
      }),
    );
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
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        lastActivityAt: '2026-08-19T12:00:00.000Z',
        lastAssistantPreview: 'Your publish-ready draft is complete.',
      }),
    );
  });
});
