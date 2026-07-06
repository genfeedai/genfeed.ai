import net from 'node:net';
import {
  WorkflowExecutionQueueService,
  workflowSchedulerId,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { Queue } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Multi-replica double-fire guarantee (issue #1091 acceptance).
 *
 * Two producers (two API replicas) upserting the SAME scheduler id against a
 * real Redis must converge on exactly ONE job scheduler and exactly ONE
 * delayed job — this is the BullMQ property that replaces both the in-process
 * CronJob-per-replica model and the interim Redis fire-window lock.
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
  'workflow scheduler double-fire guarantee (BullMQ + Redis)',
  () => {
    const queueName = `workflow-execution-double-fire-test-${process.pid}-${Date.now()}`;
    const queues: Queue[] = [];

    function createProducer(): {
      queue: Queue;
      service: WorkflowExecutionQueueService;
    } {
      const queue = new Queue(queueName, {
        connection: { url: redisUrl },
      });
      queues.push(queue);

      const service = new (
        WorkflowExecutionQueueService as unknown as new (
          ...args: unknown[]
        ) => WorkflowExecutionQueueService
      )(queue, createMockLogger());

      return { queue, service };
    }

    afterAll(async () => {
      const [first] = queues;
      if (first) {
        await first.obliterate({ force: true });
      }
      await Promise.all(queues.map((queue) => queue.close()));
    });

    it('two producers upserting the same scheduler id yield exactly one delayed job', async () => {
      const producerA = createProducer();
      const producerB = createProducer();

      const input = {
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        workflowId: 'wf-double-fire',
      };

      // Two replicas race to register the same workflow schedule.
      await Promise.all([
        producerA.service.upsertWorkflowScheduler(input),
        producerB.service.upsertWorkflowScheduler(input),
      ]);

      const schedulers = await producerA.queue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0].key).toBe(workflowSchedulerId('wf-double-fire'));

      const delayedJobs = await producerA.queue.getDelayed();
      expect(delayedJobs).toHaveLength(1);
      expect(delayedJobs[0].name).toBe('scheduled-fire');
      expect(delayedJobs[0].data).toEqual({
        type: 'scheduled-fire',
        workflowId: 'wf-double-fire',
      });
    });

    it('removeWorkflowScheduler deletes the scheduler and its pending fire', async () => {
      const producer = createProducer();

      await producer.service.upsertWorkflowScheduler({
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        workflowId: 'wf-remove-me',
      });
      await producer.service.removeWorkflowScheduler('wf-remove-me');

      const schedulers = await producer.queue.getJobSchedulers();
      expect(
        schedulers.filter(
          (scheduler) => scheduler.key === workflowSchedulerId('wf-remove-me'),
        ),
      ).toHaveLength(0);

      const delayedJobs = await producer.queue.getDelayed();
      expect(
        delayedJobs.filter(
          (job) =>
            job.name === 'scheduled-fire' &&
            job.data.workflowId === 'wf-remove-me',
        ),
      ).toHaveLength(0);
    });
  },
);
