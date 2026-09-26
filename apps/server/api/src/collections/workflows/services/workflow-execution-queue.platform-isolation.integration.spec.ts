import net from 'node:net';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { Queue, Worker } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Real-Redis regression coverage for the #5252 independent review of #5162:
 *
 * 1. A job sitting in BullMQ's `prioritized` state (added with `priority > 0`
 *    by *any* producer — not one this PR's own code creates, since priority
 *    was dropped, but a state BullMQ itself can still put a job into) must be
 *    recognized as claimable, not stale. Verified against `getState()` on a
 *    job actually added with `priority: 1` to a real queue, not a mock.
 * 2. `SystemWorkflowRunnerService.enqueueWorkflow`'s actual routing decision
 *    (`isPlatformOriginatedSource`, `isPlatformSweepWorkflow`) — not
 *    `usePlatformQueue` set by hand — lands a job on a genuinely different
 *    Redis queue, proven by running one real BullMQ `Worker` per queue and
 *    showing an interactive-queue job completes promptly while the platform
 *    queue's worker is fully occupied processing a backlog.
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

const definition: SystemWorkflowGraphDefinition = {
  canonicalId: 'clip-hook-review',
  definition: {
    edges: [],
    nodes: [
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'review-hook',
      }),
    ],
  },
  description: 'Review one generated hook clip.',
  label: 'Clip Hook Review',
  resultNodeId: 'review-hook',
};

type RunnerInternals = {
  ensureHiddenSystemWorkflowMirror: (
    def: SystemWorkflowGraphDefinition,
  ) => Promise<{
    currentVersion: { id: string };
    id: string;
    label: string;
  }>;
  resolveUserId: (organizationId: string, userId?: string) => Promise<string>;
};

describe.skipIf(!redisAvailable)(
  'platform/interactive queue isolation via SystemWorkflowRunnerService.enqueueWorkflow (BullMQ + Redis, #5252 review)',
  () => {
    const runId = `${process.pid}-${Date.now()}`;
    const interactiveQueueName = `workflow-execution-isolation-test-${runId}`;
    const platformQueueName = `platform-system-workflow-isolation-test-${runId}`;
    const queues: Queue[] = [];
    const workers: Worker[] = [];

    /**
     * A real `SystemWorkflowRunnerService` wired to a real
     * `WorkflowExecutionQueueService` (real Redis queues), with only the
     * Postgres-backed pieces that don't matter for routing stubbed out —
     * `ensureHiddenSystemWorkflowMirror`/`resolveUserId` (mirrors the
     * existing unit-spec harness in system-workflow-runner.service.spec.ts)
     * and a fake `createExecution`. `enqueueWorkflow`'s own
     * `isPlatformOriginatedSource` check, and `executeForEach`'s
     * `isPlatformSweepWorkflow` lookup, both run for real.
     */
    function createRunner(prismaOverrides: Record<string, unknown> = {}): {
      interactiveQueue: Queue;
      platformQueue: Queue;
      runner: SystemWorkflowRunnerService;
    } {
      const interactiveQueue = new Queue(interactiveQueueName, {
        connection: { url: redisUrl },
      });
      const platformQueue = new Queue(platformQueueName, {
        connection: { url: redisUrl },
      });
      queues.push(interactiveQueue, platformQueue);

      const queueService = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(interactiveQueue, platformQueue, createMockLogger());

      const workflowExecutions = {
        createExecution: vi.fn().mockImplementation(async () => ({
          id: `execution-${Math.random().toString(36).slice(2)}`,
          status: 'PENDING',
        })),
      };

      const prisma = {
        workflow: { findFirst: vi.fn().mockResolvedValue(null) },
        ...prismaOverrides,
      };

      // Minimal but functioning stand-in for the engine adapter (mirrors the
      // harness in system-workflow-runner.service.spec.ts's `createRunner`):
      // `onModuleInit()` calls `registerExecutor` for every registered graph
      // action, so a bare `{}` fallback throws before any test in this file
      // can register a workflow and run it through the real runner.
      const adapter = {
        getRegisteredActionIds: vi.fn(() => []),
        registerExecutor: vi.fn(),
      };
      const moduleRef = {
        get: (token: unknown) => {
          const name = (token as { name?: string })?.name;
          if (name === 'WorkflowExecutionQueueService') return queueService;
          if (name === 'WorkflowExecutionsService') return workflowExecutions;
          return adapter;
        },
      };

      const runner = new SystemWorkflowRunnerService(
        prisma as never,
        moduleRef as never,
      );
      const internals = runner as unknown as RunnerInternals;
      vi.spyOn(internals, 'resolveUserId').mockResolvedValue('user-1');
      vi.spyOn(internals, 'ensureHiddenSystemWorkflowMirror').mockResolvedValue(
        {
          currentVersion: { id: 'version-1' },
          id: 'workflow-1',
          label: 'Workflow',
        },
      );

      return { interactiveQueue, platformQueue, runner };
    }

    // Fresh Redis state per test: every test in this file shares the same
    // two queue *names*, so a job left over from an earlier test would
    // otherwise be picked up by a later test's worker too.
    beforeEach(async () => {
      const interactiveQueue = new Queue(interactiveQueueName, {
        connection: { url: redisUrl },
      });
      const platformQueue = new Queue(platformQueueName, {
        connection: { url: redisUrl },
      });
      await Promise.all([
        interactiveQueue.obliterate({ force: true }),
        platformQueue.obliterate({ force: true }),
      ]);
      await Promise.all([interactiveQueue.close(), platformQueue.close()]);
    });

    afterAll(async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      const [first, second] = queues;
      await Promise.all(
        [first, second].map((queue) => queue?.obliterate({ force: true })),
      );
      await Promise.all(queues.map((queue) => queue.close()));
    });

    it('treats a job in BullMQ\'s "prioritized" state as claimable, not stale (#5252 blocker)', async () => {
      const { interactiveQueue, runner } = createRunner();
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

      const internals = runner as unknown as {
        getWorkflowQueue: () => WorkflowExecutionQueueService;
      };
      await expect(
        internals.getWorkflowQueue().hasClaimableSystemWorkflowJob(jobId),
      ).resolves.toBe(true);
    });

    it('enqueueWorkflow routes a platform-sweep dispatch to the platform queue by its own source check', async () => {
      const { interactiveQueue, platformQueue, runner } = createRunner();
      runner.registerWorkflow({ ...definition, canonicalId: 'analytics-sync' });

      await runner.enqueueWorkflow({
        actionType: 'analytics-sync',
        canonicalId: 'analytics-sync',
        organizationId: 'org-1',
        source: 'PlatformWorkflowSchedulesService',
        userId: 'user-1',
      });

      expect(await platformQueue.getJobs(['waiting', 'delayed'])).toHaveLength(
        1,
      );
      expect(
        await interactiveQueue.getJobs(['waiting', 'delayed']),
      ).toHaveLength(0);
    });

    it('enqueueWorkflow routes a proactive agent-strategy turn to the platform queue by its own source check', async () => {
      const { interactiveQueue, platformQueue, runner } = createRunner();
      runner.registerWorkflow({
        ...definition,
        canonicalId: 'agent.turn.execute',
      });

      await runner.enqueueWorkflow({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'proactive',
        userId: 'user-1',
      });

      expect(await platformQueue.getJobs(['waiting', 'delayed'])).toHaveLength(
        1,
      );
      expect(
        await interactiveQueue.getJobs(['waiting', 'delayed']),
      ).toHaveLength(0);
    });

    it('enqueueWorkflow keeps a real interactive agent turn on the interactive queue', async () => {
      const { interactiveQueue, platformQueue, runner } = createRunner();
      runner.registerWorkflow({
        ...definition,
        canonicalId: 'agent.turn.execute',
      });

      await runner.enqueueWorkflow({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'AgentTurnAcceptanceService.accept',
        userId: 'user-1',
      });

      expect(
        await interactiveQueue.getJobs(['waiting', 'delayed']),
      ).toHaveLength(1);
      expect(await platformQueue.getJobs(['waiting', 'delayed'])).toHaveLength(
        0,
      );
    });

    it('processes an interactive turn promptly while the platform queue is saturated with a real routed backlog', async () => {
      const { interactiveQueue, runner } = createRunner();
      runner.registerWorkflow({
        ...definition,
        canonicalId: 'agent.autopilot.proactive',
      });
      runner.registerWorkflow({
        ...definition,
        canonicalId: 'agent.turn.execute',
      });
      const platformJobStarted: string[] = [];
      const interactiveJobCompleted: string[] = [];

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
          // A real system-run job takes real work between add() and
          // completion; a few ms here keeps this stub realistic enough that
          // queueSystemWorkflow's own post-add claimability check still
          // observes the job before it finishes.
          await new Promise((resolve) => setTimeout(resolve, 50));
          interactiveJobCompleted.push(job.id ?? '');
        },
        { connection: { url: redisUrl }, concurrency: 1 },
      );
      workers.push(interactiveWorker);

      // Back up the platform queue via the real sweep-dispatch path — the
      // kind of burst #5162 was about.
      for (let index = 0; index < 5; index += 1) {
        await runner.enqueueWorkflow({
          actionType: 'agent.autopilot.proactive',
          canonicalId: 'agent.autopilot.proactive',
          organizationId: 'org-1',
          source: 'PlatformWorkflowSchedulesService',
          userId: 'user-1',
        });
      }

      await vi.waitFor(
        () => expect(platformJobStarted.length).toBeGreaterThan(0),
        { timeout: 5000 },
      );

      // The platform queue is now busy. A real interactive turn enqueued via
      // the real routing path *after* the backlog must still complete
      // quickly — it is on a physically separate queue with its own worker.
      await runner.enqueueWorkflow({
        actionType: 'agent.turn.execute',
        canonicalId: 'agent.turn.execute',
        organizationId: 'org-1',
        source: 'AgentTurnAcceptanceService.accept',
        userId: 'user-1',
      });

      const interactiveJobs = await interactiveQueue.getJobs([
        'waiting',
        'delayed',
        'active',
      ]);
      const interactiveJobId = interactiveJobs[0]?.id;
      expect(interactiveJobId).toBeDefined();

      await vi.waitFor(
        () => expect(interactiveJobCompleted).toContain(interactiveJobId),
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

      // Close these two workers now rather than leaving them for `afterAll`:
      // both queue *names* are reused by later tests in this file, and a
      // worker left running here would immediately claim a job a later test
      // adds to the same queue before that test can observe it waiting.
      await Promise.all([platformWorker.close(), interactiveWorker.close()]);
    }, 15000);

    it('executeForEach routes scheduled children to the platform queue when the parent is a platform-sweep workflow (isPlatformSweepWorkflow)', async () => {
      const { interactiveQueue, platformQueue, runner } = createRunner({
        workflow: {
          findFirst: vi.fn().mockResolvedValue({
            metadata: {
              sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
              [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata(
                { canonicalId: 'analytics-sync' },
              ),
            },
          }),
        },
      });
      runner.onModuleInit();
      runner.registerWorkflow(definition);

      // Call the private `executeForEach` directly: it only needs
      // `request.provenance.workflowId` (to resolve `isPlatformSweepWorkflow`
      // via the real `prisma.workflow.findFirst` mock above) and
      // `request.input` — standing up the full engine adapter just to reach
      // it through a registered node executor would add scaffolding without
      // exercising anything this test doesn't already cover.
      type ExecuteForEach = (request: {
        context: { organizationId: string; userId: string };
        input: Record<string, unknown>;
        provenance: { executionId: string; workflowId: string };
      }) => Promise<unknown>;
      const executeForEach = (
        runner as unknown as { executeForEach: ExecuteForEach }
      ).executeForEach.bind(runner);

      await executeForEach({
        context: { organizationId: 'org-1', userId: 'user-1' },
        input: {
          childWorkflowId: definition.canonicalId,
          items: ['a'],
          itemInputKey: 'item',
          mode: 'scheduled',
        },
        provenance: {
          executionId: 'parent-execution',
          workflowId: 'platform-sweep-workflow-1',
        },
      });

      expect(await platformQueue.getJobs(['waiting', 'delayed'])).toHaveLength(
        1,
      );
      expect(
        await interactiveQueue.getJobs(['waiting', 'delayed']),
      ).toHaveLength(0);
    });
  },
);
