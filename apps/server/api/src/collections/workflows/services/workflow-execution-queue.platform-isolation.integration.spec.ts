import net from 'node:net';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { Queue, Worker } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Real-Redis regression coverage for the #5252 independent review of #5162:
 *
 * 1. A job sitting in BullMQ's `prioritized` state (added with `priority > 0`
 *    by *any* producer — not one this PR's own code creates, since priority
 *    was dropped, but a state BullMQ itself can still put a job into) must be
 *    recognized as claimable, not stale. Verified against `getState()` on a
 *    job actually added with `priority: 1` to a real queue, not a mock.
 * 2. `usePlatformQueue: true` really lands a job on a *different* Redis queue
 *    — proven by running one real BullMQ `Worker` per queue and showing an
 *    interactive-queue job completes promptly while the platform queue's
 *    worker is fully occupied processing a backlog.
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
  'platform/interactive queue isolation (BullMQ + Redis, #5252 review)',
  () => {
    const runId = `${process.pid}-${Date.now()}`;
    const interactiveQueueName = `workflow-execution-isolation-test-${runId}`;
    const platformQueueName = `platform-system-workflow-isolation-test-${runId}`;
    const queues: Queue[] = [];
    const workers: Worker[] = [];

    function createService(): {
      interactiveQueue: Queue;
      platformQueue: Queue;
      service: WorkflowExecutionQueueService;
    } {
      const interactiveQueue = new Queue(interactiveQueueName, {
        connection: { url: redisUrl },
      });
      const platformQueue = new Queue(platformQueueName, {
        connection: { url: redisUrl },
      });
      queues.push(interactiveQueue, platformQueue);

      const service = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(interactiveQueue, platformQueue, createMockLogger());

      return { interactiveQueue, platformQueue, service };
    }

    afterAll(async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      const [first, second] = queues;
      await Promise.all(
        [first, second].map((queue) => queue?.obliterate({ force: true })),
      );
      await Promise.all(queues.map((queue) => queue.close()));
    });

    it('treats a job in BullMQ\'s "prioritized" state as claimable, not stale (#5252 blocker)', async () => {
      const { interactiveQueue, service } = createService();
      const jobId = 'system-workflow-prioritized-job';

      // Any producer adding a job with `priority > 0` puts it in BullMQ's
      // separate `prioritized` ZSET — not the plain `waiting` list. This PR's
      // own code no longer sets priority, but the state-recognition fix must
      // hold regardless of who set it.
      await interactiveQueue.add(
        'system-run',
        { type: 'system-run' },
        { jobId, priority: 1 },
      );
      const job = await interactiveQueue.getJob(jobId);
      await expect(job?.getState()).resolves.toBe('prioritized');

      await expect(service.hasClaimableSystemWorkflowJob(jobId)).resolves.toBe(
        true,
      );
    });

    it('routes usePlatformQueue jobs onto a different real Redis queue than interactive jobs', async () => {
      const { interactiveQueue, platformQueue, service } = createService();

      await service.queueSystemWorkflow(
        {
          actionType: 'agent.turn.execute',
          canonicalId: 'agent.turn.execute',
          organizationId: 'org-1',
          source: 'agent',
          userId: 'user-1',
        },
        'system-workflow-interactive-1',
      );
      await service.queueSystemWorkflow(
        {
          actionType: 'agent.autopilot.proactive',
          canonicalId: 'agent.autopilot.proactive',
          organizationId: 'org-1',
          source: 'PlatformWorkflowSchedulesService',
          userId: 'user-1',
        },
        'system-workflow-platform-1',
        { usePlatformQueue: true },
      );

      await expect(
        interactiveQueue.getJob('system-workflow-interactive-1'),
      ).resolves.toBeDefined();
      await expect(
        interactiveQueue.getJob('system-workflow-platform-1'),
      ).resolves.toBeUndefined();
      await expect(
        platformQueue.getJob('system-workflow-platform-1'),
      ).resolves.toBeDefined();
      await expect(
        platformQueue.getJob('system-workflow-interactive-1'),
      ).resolves.toBeUndefined();
    });

    it('processes an interactive turn promptly while the platform queue is saturated with backlog', async () => {
      const { interactiveQueue, service } = createService();
      const platformJobStarted: string[] = [];
      const interactiveJobCompleted: string[] = [];

      // Saturate the platform queue: concurrency 1, every job hangs until the
      // test releases it, simulating a burst the platform queue must absorb
      // without affecting the interactive queue at all.
      let releasePlatformJobs: () => void = () => {};
      const platformJobsUnblocked = new Promise<void>((resolve) => {
        releasePlatformJobs = resolve;
      });
      const platformWorker = new Worker(
        platformQueueName,
        async (job) => {
          platformJobStarted.push(job.id ?? '');
          await platformJobsUnblocked;
        },
        { connection: { url: redisUrl }, concurrency: 1 },
      );
      workers.push(platformWorker);

      const interactiveWorker = new Worker(
        interactiveQueueName,
        async (job) => {
          interactiveJobCompleted.push(job.id ?? '');
        },
        { connection: { url: redisUrl }, concurrency: 1 },
      );
      workers.push(interactiveWorker);

      // Back up the platform queue with more jobs than its concurrency can
      // run at once — the kind of burst #5162 was about.
      for (let index = 0; index < 5; index += 1) {
        await service.queueSystemWorkflow(
          {
            actionType: 'agent.autopilot.proactive',
            canonicalId: 'agent.autopilot.proactive',
            organizationId: 'org-1',
            source: 'PlatformWorkflowSchedulesService',
            userId: 'user-1',
          },
          `system-workflow-platform-backlog-${index}`,
          { usePlatformQueue: true },
        );
      }

      await vi.waitFor(
        () => expect(platformJobStarted.length).toBeGreaterThan(0),
        { timeout: 5000 },
      );

      // The platform queue is now busy (worker occupied, 4 more waiting).
      // An interactive turn enqueued *after* the backlog must still complete
      // quickly — it never has to wait behind the platform queue's backlog
      // because it is a physically separate queue with its own worker.
      await service.queueSystemWorkflow(
        {
          actionType: 'agent.turn.execute',
          canonicalId: 'agent.turn.execute',
          organizationId: 'org-1',
          source: 'agent',
          userId: 'user-1',
        },
        'system-workflow-interactive-during-backlog',
      );

      await vi.waitFor(
        () =>
          expect(interactiveJobCompleted).toContain(
            'system-workflow-interactive-during-backlog',
          ),
        { timeout: 5000 },
      );

      // The platform backlog is still stuck behind its own saturation —
      // proof this never depended on the interactive turn also being slow.
      expect(platformJobStarted.length).toBeLessThan(5);

      releasePlatformJobs();
      await vi.waitFor(() => expect(platformJobStarted.length).toBe(5), {
        timeout: 5000,
      });

      expect(await interactiveQueue.getJobCounts('waiting', 'active')).toEqual({
        active: 0,
        waiting: 0,
      });
    }, 15000);
  },
);
