import net from 'node:net';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { Queue } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Real-Redis regression coverage for the #5252 independent review of #5162:
 * the reconciler must NOT fail a `WorkflowExecution` whose BullMQ job is
 * still genuinely claimable — only `staleExecutionFinder`/`completeExecution`
 * (the Postgres side) are mocked here; the claimability check runs against a
 * real Redis queue through the real `WorkflowExecutionQueueService`.
 *
 * Requires a reachable Redis (localhost:6379 or REDIS_URL). Skipped when
 * unavailable (e.g. unit-test CI runners without a Redis service).
 */

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

function isRedisAvailable(): Promise<boolean> {
  const parsed = new URL(redisUrl);

  return new Promise((resolve) => {
    const socket = net.connect({
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      timeout: 500,
    });

    const finish = (isUp: boolean) => {
      socket.destroy();
      resolve(isUp);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

const redisAvailable = await isRedisAvailable();

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe.skipIf(!redisAvailable)(
  'PendingWorkflowExecutionReconcileService (BullMQ + Redis, #5252 review)',
  () => {
    const runId = `${process.pid}-${Date.now()}`;
    const queueName = `workflow-execution-reconcile-test-${runId}`;
    const queue = new Queue(queueName, { connection: { url: redisUrl } });
    const queueService = new (
      WorkflowExecutionQueueService as unknown as new (
        ...args: unknown[]
      ) => WorkflowExecutionQueueService
    )(queue, queue, createMockLogger());

    afterAll(async () => {
      await queue.obliterate({ force: true });
      await queue.close();
    });

    it('does not fail a stale-pending execution whose job is still waiting', async () => {
      const executionId = 'execution-still-waiting';
      await queue.add(
        'system-run',
        { type: 'system-run' },
        { jobId: `system-workflow-${executionId}` },
      );

      const workflowExecutions = { completeExecution: vi.fn() };
      const staleExecutionFinder = {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: executionId, organizationId: 'org-1' }]),
        findManyAncient: vi.fn().mockResolvedValue([]),
      };
      const logger = createMockLogger();
      const service = new PendingWorkflowExecutionReconcileService(
        workflowExecutions as never,
        staleExecutionFinder as never,
        queueService,
        logger as never,
      );

      await service.reconcile();

      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    });

    it('fails a stale-pending execution whose job is gone entirely', async () => {
      const executionId = 'execution-never-queued';
      // Deliberately no job added under `system-workflow-${executionId}`.

      const workflowExecutions = {
        completeExecution: vi.fn().mockResolvedValue({ status: 'FAILED' }),
      };
      const staleExecutionFinder = {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: executionId, organizationId: 'org-1' }]),
        findManyAncient: vi.fn().mockResolvedValue([]),
      };
      const logger = createMockLogger();
      const service = new PendingWorkflowExecutionReconcileService(
        workflowExecutions as never,
        staleExecutionFinder as never,
        queueService,
        logger as never,
      );

      await service.reconcile();

      expect(workflowExecutions.completeExecution).toHaveBeenCalledWith(
        executionId,
        expect.stringContaining('no worker ever picked it up'),
      );
    });

    it('silently cancels an ancient (>24h) stale-pending execution — no loud failure', async () => {
      const executionId = 'execution-ancient-never-queued';
      // Deliberately no job added under `system-workflow-${executionId}`.

      const workflowExecutions = {
        cancelExecution: vi.fn().mockResolvedValue({ status: 'CANCELLED' }),
        completeExecution: vi.fn(),
      };
      const staleExecutionFinder = {
        findMany: vi.fn().mockResolvedValue([]),
        findManyAncient: vi
          .fn()
          .mockResolvedValue([{ id: executionId, organizationId: 'org-1' }]),
      };
      const logger = createMockLogger();
      const service = new PendingWorkflowExecutionReconcileService(
        workflowExecutions as never,
        staleExecutionFinder as never,
        queueService,
        logger as never,
      );

      await service.reconcile();

      expect(workflowExecutions.cancelExecution).toHaveBeenCalledWith(
        executionId,
      );
      expect(workflowExecutions.completeExecution).not.toHaveBeenCalled();
    });
  },
);
