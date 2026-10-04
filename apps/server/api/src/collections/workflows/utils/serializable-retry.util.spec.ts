import { runSerializableWithRetry } from '@api/collections/workflows/utils/serializable-retry.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function prismaError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('runSerializableWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries a transaction-start timeout until it succeeds', async () => {
    const $transaction = vi
      .fn()
      .mockRejectedValueOnce(
        prismaError(
          'P2028',
          'Transaction API error: Unable to start a transaction in the given time.',
        ),
      )
      .mockResolvedValueOnce('created');

    const promise = runSerializableWithRetry({ $transaction }, vi.fn());
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('created');
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt limit with the original error', async () => {
    const error = prismaError('P2028', 'Unable to start a transaction');
    const $transaction = vi.fn().mockRejectedValue(error);

    const promise = runSerializableWithRetry({ $transaction }, vi.fn());
    const assertion = expect(promise).rejects.toBe(error);
    await vi.runAllTimersAsync();

    await assertion;
    expect($transaction).toHaveBeenCalledTimes(5);
  });

  it('does not retry a commit timeout, whose outcome is unknown', async () => {
    const error = prismaError('P2028', 'Transaction API error: commit timeout');
    const $transaction = vi.fn().mockRejectedValue(error);

    await expect(
      runSerializableWithRetry({ $transaction }, vi.fn()),
    ).rejects.toBe(error);
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
