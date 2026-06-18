import { AgentMessagesService } from '@api/collections/agent-messages/services/agent-messages.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentMessagesService', () => {
  const agentMessage = {
    count: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };

  let service: AgentMessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    agentMessage.findMany.mockResolvedValue([]);

    service = new AgentMessagesService(
      { agentMessage } as unknown as PrismaService,
      {} as LoggerService,
    );
  });

  it('uses bounded cursor pagination for room messages', async () => {
    await service.getMessagesByRoom('thread-1', 'org-1', {
      cursor: '2026-06-01T10:00:00.000Z',
      limit: 999,
    });

    expect(agentMessage.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: undefined,
      take: 100,
      where: {
        createdAt: { lt: new Date('2026-06-01T10:00:00.000Z') },
        isDeleted: false,
        organizationId: 'org-1',
        threadId: 'thread-1',
      },
    });
  });

  it('keeps legacy page support bounded when no cursor is provided', async () => {
    await service.getMessagesByRoom('thread-1', 'org-1', {
      limit: 25,
      page: 3,
    });

    expect(agentMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 25,
      }),
    );
  });

  it('bounds compaction backlog reads', async () => {
    await service.getAllMessages('thread-1');
    await service.getAllMessagesAfter('thread-1', 'msg-1');

    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 500 }),
    );
    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 500 }),
    );
  });

  it('copies messages in bounded pages', async () => {
    agentMessage.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, index) => ({
          id: `msg-${index}`,
          organizationId: 'org-1',
          role: 'user',
          threadId: 'source',
        })),
      )
      .mockResolvedValueOnce([]);
    agentMessage.create.mockResolvedValue({});

    await service.copyMessages('source', 'target', 'org-1');

    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 500 }),
    );
    expect(agentMessage.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'msg-499' },
        skip: 1,
        take: 500,
      }),
    );
    expect(agentMessage.create).toHaveBeenCalledTimes(500);
  });
});
