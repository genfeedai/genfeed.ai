import { TargetExecutionState } from '@genfeedai/contracts';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { describe, expect, it, vi } from 'vitest';

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

function boundary() {
  const transaction = vi.fn(),
    warn = vi.fn();
  const service = new SchedulerPublishStateService(
    { $transaction: transaction } as never,
    { warn } as never,
    { transition: vi.fn() } as never,
  );
  const input = {
    organizationId: 'owned-org',
    postId: 'owned-post',
    update: { executionState: TargetExecutionState.PUBLISHED },
  };
  return { transaction, warn, service, input };
}

describe('scheduler transaction conflict boundary', () => {
  it.each(conflicts)(
    'retries a structurally identified conflict: %j',
    async (error) => {
      const { transaction, warn, service, input } = boundary();
      transaction
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ applied: true, finalizationCreated: false });
      await expect(service.transition(input)).resolves.toBe(true);
      expect(transaction).toHaveBeenCalledTimes(2);
      for (const [, options] of transaction.mock.calls)
        expect(options).toEqual({ isolationLevel: 'ReadCommitted' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.any(String), {
        attempt: 1,
        groupId: undefined,
        postId: input.postId,
      });
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
      const { transaction, warn, service, input } = boundary();
      transaction.mockRejectedValue(error);
      await expect(service.transition(input)).rejects.toBe(error);
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(warn).toHaveBeenCalledTimes(2);
      for (const [, options] of transaction.mock.calls)
        expect(options).toEqual({ isolationLevel: 'ReadCommitted' });
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
    const { transaction, warn, service, input } = boundary();
    transaction.mockRejectedValue(error);
    await expect(service.transition(input)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
