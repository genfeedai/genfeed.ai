import { AgentRunQueueService } from '@api/queues/agent-run/agent-run-queue.service';
import { AgentRunStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { CronAgentTurnReconcileService } from '@workers/crons/agent-turn/cron.agent-turn-reconcile.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CronAgentTurnReconcileService', () => {
  const payload = {
    clientRequestId: 'request-1',
    encryptedAuthToken: 'encrypted-token',
    kind: 'agent-chat-turn' as const,
    organizationId: 'org-1',
    request: {
      clientRequestId: 'request-1',
      content: 'Generate an image',
      threadId: 'thread-1',
    },
    runId: 'run-1',
    threadId: 'thread-1',
    userId: 'user-1',
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    agentRun: {
      findMany: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let queue: { queueRun: ReturnType<typeof vi.fn> };
  let service: CronAgentTurnReconcileService;

  beforeEach(() => {
    logger = { error: vi.fn(), log: vi.fn() };
    prisma = {
      agentRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    queue = { queueRun: vi.fn().mockResolvedValue('agent-run-run-1') };
    service = new CronAgentTurnReconcileService(
      logger as unknown as LoggerService,
      prisma as unknown as PrismaService,
      queue as unknown as AgentRunQueueService,
    );
  });

  it('re-enqueues a stale accepted turn from its encrypted durable payload', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      {
        config: { durableQueuePayload: payload },
        id: 'run-1',
        metadata: { requestState: 'queued' },
        organizationId: 'org-1',
      },
    ]);

    await service.reconcileStrandedTurns();

    expect(prisma.agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        where: expect.objectContaining({
          isDeleted: false,
          status: AgentRunStatus.PENDING,
        }),
      }),
    );
    expect(queue.queueRun).toHaveBeenCalledWith(payload);
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      data: {
        metadata: expect.objectContaining({
          requestState: 'reconciled',
        }),
      },
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: AgentRunStatus.PENDING,
      },
    });
  });

  it('fails a stale turn whose durable queue payload is invalid', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      {
        config: { durableQueuePayload: { runId: 'wrong-run' } },
        id: 'run-1',
        metadata: { requestState: 'queued' },
        organizationId: 'org-1',
      },
    ]);

    await service.reconcileStrandedTurns();

    expect(queue.queueRun).not.toHaveBeenCalled();
    expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        error: 'Durable agent turn recovery payload is invalid.',
        status: AgentRunStatus.FAILED,
      }),
      where: {
        id: 'run-1',
        isDeleted: false,
        organizationId: 'org-1',
        status: AgentRunStatus.PENDING,
      },
    });
  });
});
