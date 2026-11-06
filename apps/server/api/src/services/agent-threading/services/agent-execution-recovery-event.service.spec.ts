import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import { AgentExecutionRecoveryEventService } from '@api/services/agent-threading/services/agent-execution-recovery-event.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

const orgId = 'a'.repeat(24);
const threadId = 'b'.repeat(24);
const userId = 'c'.repeat(24);
const executionId = 'execution-1';

interface ThreadRow {
  id: string;
  isDeleted: boolean;
  organizationId: string;
  userId: string;
}

describe('AgentExecutionRecoveryEventService', () => {
  let executions: Map<string, { organizationId: string; result: unknown }>;
  let threads: ThreadRow[];
  let events: Array<Record<string, unknown>>;
  let warnings: Array<{ context: unknown; message: string }>;
  let isEventStoreDown: boolean;
  let service: AgentExecutionRecoveryEventService;

  beforeEach(() => {
    executions = new Map([
      [
        executionId,
        { organizationId: orgId, result: { metadata: { threadId } } },
      ],
    ]);
    threads = [
      { id: threadId, isDeleted: false, organizationId: orgId, userId },
    ];
    events = [];
    warnings = [];
    isEventStoreDown = false;

    service = new AgentExecutionRecoveryEventService(
      {
        workflowExecution: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            executions.get(where.id) ?? null,
        },
      } as unknown as PrismaService,
      {
        findOneSelect: async (where: Omit<ThreadRow, 'userId'>) => {
          const row = threads.find(
            (thread) =>
              thread.id === where.id &&
              thread.isDeleted === where.isDeleted &&
              thread.organizationId === where.organizationId,
          );
          return row ? { userId: row.userId } : null;
        },
      } as unknown as AgentThreadsService,
      {
        appendEvent: async (event: Record<string, unknown>) => {
          if (isEventStoreDown) {
            throw new Error('db down');
          }
          events.push(event);
          return { sequence: events.length };
        },
      } as unknown as AgentThreadEngineService,
      {
        warn: (message: string, context: unknown) => {
          warnings.push({ context, message });
        },
      } as unknown as LoggerService,
    );
  });

  it('records a failed run on the execution thread with the orchestrator command id', async () => {
    await service.recordExecutionEnded(executionId, {
      error: 'never started',
      type: 'failed',
    });

    expect(events).toEqual([
      {
        commandId: `run-failed:${threadId}:${executionId}`,
        metadata: { origin: 'execution-recovery' },
        organizationId: orgId,
        payload: {
          error: 'never started',
          label: 'Agent failed',
          status: 'failed',
        },
        runId: executionId,
        threadId,
        type: 'run.failed',
        userId,
      },
    ]);
  });

  it('records a cancelled run', async () => {
    await service.recordExecutionEnded(executionId, { type: 'cancelled' });

    expect(events).toEqual([
      expect.objectContaining({
        commandId: `run-cancelled:${threadId}:${executionId}`,
        payload: { label: 'Agent cancelled', status: 'cancelled' },
        runId: executionId,
        type: 'run.cancelled',
      }),
    ]);
  });

  it.each([
    [
      'an execution that is not an agent turn',
      () => executions.set(executionId, { organizationId: orgId, result: {} }),
    ],
    ['an unknown execution', () => executions.clear()],
    [
      'a deleted thread',
      () => {
        threads[0] = { ...(threads[0] as ThreadRow), isDeleted: true };
      },
    ],
    [
      'a thread in another organization',
      () => {
        threads[0] = {
          ...(threads[0] as ThreadRow),
          organizationId: 'd'.repeat(24),
        };
      },
    ],
  ])('records nothing for %s', async (_label, arrange) => {
    arrange();

    await service.recordExecutionEnded(executionId, {
      error: 'x',
      type: 'failed',
    });

    expect(events).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('never throws, so recovery still closes the execution', async () => {
    isEventStoreDown = true;

    await expect(
      service.recordExecutionEnded(executionId, { error: 'x', type: 'failed' }),
    ).resolves.toBeUndefined();
    expect(warnings).toEqual([
      {
        context: { error: 'db down', executionId },
        message: expect.stringContaining('failed to record the ended run'),
      },
    ]);
  });
});
