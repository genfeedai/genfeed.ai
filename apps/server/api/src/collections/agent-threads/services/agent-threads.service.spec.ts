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
import type { LoggerService } from '@libs/logger/logger.service';

type AgentThreadDelegate = {
  update: ReturnType<typeof vi.fn>;
};

describe('AgentThreadsService Prisma row contract', () => {
  let delegate: AgentThreadDelegate;
  let service: AgentThreadsService;

  beforeEach(() => {
    delegate = {
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

  it('keeps canonical ids required while legacy relation aliases remain optional', () => {
    expectTypeOf<
      Pick<AgentRoomDocument, 'organizationId' | 'userId'>
    >().toEqualTypeOf<{
      organizationId: string;
      userId: string;
    }>();
    expectTypeOf<
      Pick<AgentRoomDocument, 'organization' | 'user'>
    >().toEqualTypeOf<{
      organization?: string;
      user?: string;
    }>();
  });

  it('returns a bare delegate update row without inventing legacy aliases', async () => {
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
    expect(result.organization).toBeUndefined();
    expect(result.user).toBeUndefined();
  });
});
