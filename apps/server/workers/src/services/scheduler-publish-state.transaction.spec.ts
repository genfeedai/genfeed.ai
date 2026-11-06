import type { PostLifecycleService } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { describe, expect, it } from 'vitest';

const conflicts = [
  { code: 'P2034' },
  ...['40001', '40P01'].flatMap((code) => [
    { code: 'P2010', meta: { code } },
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: code } } },
    },
  ]),
];

/**
 * The publish-state writer over a database whose transactions throw the
 * given failures in order and then commit. It records the isolation level of
 * every attempt and the retry warnings.
 */
function writerFailing(...failures: unknown[]) {
  const attempts: unknown[] = [];
  const warnings: unknown[] = [];
  const prisma = {
    $transaction: async (_work: unknown, options: unknown) => {
      attempts.push(options);
      if (attempts.length <= failures.length) {
        throw failures[attempts.length - 1];
      }
      return { applied: true, finalizationCreated: false };
    },
  };
  const service = new SchedulerPublishStateService(
    prisma as unknown as PrismaService,
    {
      warn: (_message: string, detail: unknown) => {
        warnings.push(detail);
      },
    } as unknown as LoggerService,
    {} as PostLifecycleService,
  );
  const input = {
    organizationId: 'owned-org',
    postId: 'owned-post',
    update: { executionState: TargetExecutionState.PUBLISHED },
  };
  return { attempts, input, service, warnings };
}

const READ_COMMITTED = { isolationLevel: 'ReadCommitted' };

describe('scheduler transaction conflict boundary', () => {
  it.each(conflicts)(
    'retries a structurally identified conflict: %j',
    async (error) => {
      const { attempts, input, service, warnings } = writerFailing(error);

      await expect(service.transition(input)).resolves.toBe(true);

      expect(attempts).toEqual([READ_COMMITTED, READ_COMMITTED]);
      expect(warnings).toEqual([
        { attempt: 1, groupId: undefined, postId: 'owned-post' },
      ]);
      expect(input).toEqual({
        organizationId: 'owned-org',
        postId: 'owned-post',
        update: { executionState: TargetExecutionState.PUBLISHED },
      });
    },
  );

  it.each(conflicts)(
    'rethrows the final conflict after three attempts: %j',
    async (error) => {
      const { attempts, input, service, warnings } = writerFailing(
        error,
        error,
        error,
      );

      await expect(service.transition(input)).rejects.toBe(error);

      expect(attempts).toEqual([
        READ_COMMITTED,
        READ_COMMITTED,
        READ_COMMITTED,
      ]);
      expect(warnings).toHaveLength(2);
    },
  );

  it.each([
    null,
    '40001',
    {},
    { code: 'P2010' },
    { code: 'P2010', meta: null },
    { code: 'P2010', meta: { code: 40001 } },
    { code: 'P2010', meta: { code: '23505' } },
    {
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    },
    { code: 'OTHER', meta: { code: '40001' } },
    { message: 'serialization failure 40001' },
  ])('does not retry malformed or unrelated failures: %j', async (error) => {
    const { attempts, input, service, warnings } = writerFailing(error);

    await expect(service.transition(input)).rejects.toBe(error);

    expect(attempts).toEqual([READ_COMMITTED]);
    expect(warnings).toEqual([]);
  });
});
