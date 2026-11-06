import { runWithWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting.context';
import { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import { ActivitySource } from '@genfeedai/contracts';
import type { QueuedCreditChargeData } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it } from 'vitest';

interface StoredJob {
  attemptsMade: number;
  data: QueuedCreditChargeData;
  id: string;
  name: string;
  opts: Record<string, unknown>;
  state: 'waiting' | 'failed';
}

const charge = (
  fields: Partial<QueuedCreditChargeData> = {},
): QueuedCreditChargeData => ({
  amount: 100,
  description: 'Test deduction',
  idempotencyKey: 'charge-1',
  organizationId: 'org-123',
  source: ActivitySource.VIDEO_GENERATION,
  type: 'deduct-credits',
  userId: 'user-456',
  ...fields,
});

const accepted = {
  acceptedGeneration: { externalId: 'provider-id', ingredientId: 'asset' },
};

describe('CreditDeductionQueueService', () => {
  let jobs: StoredJob[];
  let isRedisDown: boolean;
  let service: CreditDeductionQueueService;

  const job = (id: string) => jobs.find((stored) => stored.id === id);

  beforeEach(() => {
    jobs = [];
    isRedisDown = false;

    // The credit-deduction queue held in memory. BullMQ keeps one job per id.
    const queue = {
      add: async (
        name: string,
        data: QueuedCreditChargeData,
        opts: Record<string, unknown>,
      ) => {
        if (isRedisDown) throw new Error('Redis connection lost');
        const stored: StoredJob = {
          attemptsMade: 0,
          data,
          id: String(opts.jobId),
          name,
          opts,
          state: 'waiting',
        };
        jobs.push(stored);
        return stored;
      },
      getJob: async (id: string) => {
        const stored = job(id);
        return (
          stored && {
            getState: async () => stored.state,
            retry: async (
              _state: string,
              { resetAttemptsMade }: { resetAttemptsMade: boolean },
            ) => {
              stored.state = 'waiting';
              stored.attemptsMade = resetAttemptsMade ? 0 : stored.attemptsMade;
            },
          }
        );
      },
    } as unknown as Queue;

    service = new CreditDeductionQueueService(queue, {
      error: () => undefined,
      log: () => undefined,
    } as unknown as LoggerService);
  });

  it.each([
    ['queueDeduction', 'deduct-credits', 'credit-deduct-org-123-charge-1'],
    ['queueByokUsage', 'record-byok-usage', 'byok-usage-org-123-charge-1'],
  ] as const)(
    '%s queues the charge under an id derived from its idempotency key',
    async (method, name, jobId) => {
      const data = charge({ type: name });

      await service[method](data);

      expect(jobs).toEqual([
        {
          attemptsMade: 0,
          data,
          id: jobId,
          name,
          opts: { jobId },
          state: 'waiting',
        },
      ]);
    },
  );

  it.each([
    ['queueDeduction', 'deduct-credits'],
    ['queueByokUsage', 'record-byok-usage'],
  ] as const)(
    '%s retains accepted generation charges with the seven day retry window',
    async (method, name) => {
      await service[method](charge({ ...accepted, type: name }));

      expect(jobs[0]?.opts).toMatchObject({
        attempts: 20_160,
        backoff: { delay: 30_000, type: 'fixed' },
        removeOnFail: false,
      });
    },
  );

  it.each([
    [
      'fleet-voice-clone-job-1',
      'credit-deduct-org-123-fleet-voice-clone-job-1',
    ],
    [
      'generation:composer-generation-execution-1',
      'credit-deduct-org-123-generation-composer-generation-execution-1',
    ],
  ])(
    'keeps the job id deterministic and BullMQ-safe for %s',
    async (idempotencyKey, jobId) => {
      await service.queueDeduction(charge({ idempotencyKey }));

      expect(jobs.map(({ id }) => id)).toEqual([jobId]);
    },
  );

  it('gives two charges for one org in the same millisecond distinct jobs', async () => {
    await service.queueDeduction(charge({ idempotencyKey: 'charge-a' }));
    await service.queueDeduction(charge({ idempotencyKey: 'charge-b' }));

    expect(jobs.map(({ id }) => id)).toEqual([
      'credit-deduct-org-123-charge-a',
      'credit-deduct-org-123-charge-b',
    ]);
  });

  it('queues a replayed charge only once', async () => {
    await service.queueDeduction(charge());
    await service.queueDeduction(charge({ amount: 999 }));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data.amount).toBe(100);
  });

  it('revives a failed idempotent settlement when completion is reconciled again', async () => {
    await service.queueDeduction(
      charge({ idempotencyKey: 'media-generation-settle:hold' }),
    );
    Object.assign(jobs[0] as StoredJob, { attemptsMade: 7, state: 'failed' });

    await service.queueDeduction(
      charge({ idempotencyKey: 'media-generation-settle:hold' }),
    );

    expect(jobs).toEqual([
      expect.objectContaining({
        attemptsMade: 0,
        id: 'credit-deduct-org-123-media-generation-settle-hold',
        state: 'waiting',
      }),
    ]);
  });

  it.each(['queueDeduction', 'queueByokUsage'] as const)(
    'refuses %s without an idempotency key instead of deriving a time based job id',
    async (method) => {
      const { idempotencyKey: _key, ...keyless } = charge();

      // @ts-expect-error The key is required by the type; this proves the runtime guard too.
      await expect(service[method](keyless)).rejects.toThrow(
        BadRequestException,
      );
      expect(jobs).toEqual([]);
    },
  );

  it.each(['queueDeduction', 'queueByokUsage'] as const)(
    '%s surfaces a queue outage to the caller',
    async (method) => {
      isRedisDown = true;

      await expect(service[method](charge())).rejects.toThrow(
        'Redis connection lost',
      );
    },
  );

  it.each([
    ['the same organization', 'org-123', true],
    ['another organization', 'org-other', false],
  ])(
    'attributes the charge to the running workflow of %s',
    async (_case, organizationId, isAttributed) => {
      const scope = {
        organizationId,
        workflowExecutionId: 'execution-1',
        workflowNodeId: 'node-1',
        workflowOperationId: 'operation-1',
      };

      await runWithWorkflowAccounting(scope, () =>
        service.queueDeduction(charge()),
      );

      expect('workflowAccounting' in (jobs[0]?.data ?? {})).toBe(isAttributed);
    },
  );
});
