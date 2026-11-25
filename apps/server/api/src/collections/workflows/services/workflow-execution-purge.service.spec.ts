import { WorkflowExecutionPurgeService } from '@api/collections/workflows/services/workflow-execution-purge.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-16T12:00:00.000Z');

function startFailure() {
  return Object.assign(
    new Error('Unable to start a transaction in the given time.'),
    { code: 'P2028' },
  );
}

/** A transaction whose `settings` session statements return 0 and whose bulk statement affects `rows`. */
function transaction(settings: number, rows: number) {
  const $executeRaw = vi.fn();
  for (let setting = 0; setting < settings; setting += 1)
    $executeRaw.mockResolvedValueOnce(0);
  return { $executeRaw: $executeRaw.mockResolvedValueOnce(rows) };
}

function build(
  run: (callback: (tx: ReturnType<typeof transaction>) => unknown) => unknown,
) {
  const $transaction = vi.fn(run);
  const service = new WorkflowExecutionPurgeService(
    { $transaction } as unknown as PrismaService,
    { log: vi.fn() } as unknown as LoggerService,
  );
  return { $transaction, service };
}

describe('WorkflowExecutionPurgeService transaction start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('purges after a transient failure to start the transaction', async () => {
    let attempts = 0;
    const { $transaction, service } = build((callback) => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(startFailure())
        : callback(transaction(2, 3));
    });

    const result = service.purgeExpiredExecutions({ batchSize: 5, now: NOW });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await result).toEqual({ batches: 1, executions: 3 });
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('fails the stale-run sweep after a transient start failure', async () => {
    let attempts = 0;
    const { service } = build((callback) => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(startFailure())
        : callback(transaction(1, 2));
    });

    const result = service.failStaleExecutions({ now: NOW });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await result).toBe(2);
  });

  it('surfaces a persistent start failure after a bounded number of attempts', async () => {
    const { $transaction, service } = build(() =>
      Promise.reject(startFailure()),
    );

    const result = service.purgeExpiredExecutions({ now: NOW });
    const rejection = expect(result).rejects.toThrow('Unable to start');
    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;

    expect($transaction).toHaveBeenCalledTimes(5);
  });

  it('does not retry an error that is not a start failure', async () => {
    const { $transaction, service } = build(() =>
      Promise.reject(new Error('deadlock detected')),
    );

    await expect(service.purgeExpiredExecutions({ now: NOW })).rejects.toThrow(
      'deadlock detected',
    );
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
