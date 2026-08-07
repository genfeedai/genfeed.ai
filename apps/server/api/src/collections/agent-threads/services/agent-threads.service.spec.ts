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
import { AgentThreadStatus } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

type AgentThreadDelegate = {
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type FindManyArgs = {
  orderBy?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

describe('AgentThreadsService Prisma row contract', () => {
  let delegate: AgentThreadDelegate;
  let service: AgentThreadsService;

  beforeEach(() => {
    delegate = {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    };

    service = new AgentThreadsService(
      { agentThread: delegate } as unknown as PrismaService,
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
});
