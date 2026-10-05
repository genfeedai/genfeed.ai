import {
  isSerializationFailure,
  runSerializableWithRetry,
} from '@api/collections/workflows/utils/serializable-retry.util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function prismaError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function rawQuerySerializationError() {
  return Object.assign(new Error('synthetic raw query failure'), {
    code: 'P2010',
    meta: { driverAdapterError: { cause: { originalCode: '40001' } } },
  });
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

  it('retries the exact raw-query serialization representation observed with adapter-pg', async () => {
    const callback = vi.fn(async () => 'created');
    const $transaction = vi
      .fn()
      .mockRejectedValueOnce(rawQuerySerializationError())
      .mockImplementationOnce((callback) => callback({}));
    const promise = runSerializableWithRetry({ $transaction }, callback);
    const assertion = expect(promise).resolves.toBe('created');
    void assertion.catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;
    expect($transaction).toHaveBeenCalledTimes(2);
    expect($transaction).toHaveBeenNthCalledWith(2, callback, {
      isolationLevel: 'Serializable',
    });
  });

  it('reruns the whole aborted callback and preserves the fresh domain refusal', async () => {
    const domainError = new Error('stale_visual_revision');
    const callback = vi
      .fn()
      .mockResolvedValueOnce('aborted')
      .mockRejectedValueOnce(domainError);
    const $transaction = vi
      .fn()
      .mockImplementationOnce(async (callback) => {
        await callback({});
        throw rawQuerySerializationError();
      })
      .mockImplementationOnce((callback) => callback({}));
    const assertion = expect(
      runSerializableWithRetry({ $transaction }, callback),
    ).rejects.toBe(domainError);
    void assertion.catch(() => {});
    await vi.runAllTimersAsync();
    await assertion;
    expect(callback).toHaveBeenCalledTimes(2);
    expect($transaction).toHaveBeenCalledTimes(2);
  });

  it('bounds raw-query retries to five attempts and rethrows the original error', async () => {
    const error = rawQuerySerializationError();
    const $transaction = vi.fn().mockRejectedValue(error);
    const assertion = expect(
      runSerializableWithRetry({ $transaction }, vi.fn()),
    ).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect($transaction).toHaveBeenCalledTimes(5);
  });

  it.each([
    null,
    undefined,
    '40001',
    40001,
    [],
    { code: 'P2010' },
    { code: 'P2010', meta: null },
    { code: 'P2010', meta: [] },
    { code: 'P2010', meta: '40001' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { driverAdapterError: null } },
    { code: 'P2010', meta: { driverAdapterError: [] } },
    { code: 'P2010', meta: { driverAdapterError: '40001' } },
    { code: 'P2010', meta: { driverAdapterError: { originalCode: '40001' } } },
    { code: 'P2010', meta: { cause: { originalCode: '40001' } } },
    { code: 'P2010', originalCode: '40001' },
    { code: 'P2010', meta: { driverAdapterError: { cause: null } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: [] } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: '40001' } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: {} } } },
    ...[null, ['40001']].map((originalCode) => ({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode } } },
    })),
    ...['40P01', '23505', '23503', '57014', '08006', '40001-extra', 40001].map(
      (originalCode) => ({
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode } } },
      }),
    ),
    ...['P2002', 'P2028', 'P2024', 'P1001'].map((code) => ({
      code,
      meta: { driverAdapterError: { cause: { originalCode: '40001' } } },
    })),
  ])(
    'propagates unrelated codes and malformed metadata unchanged: %j',
    async (error) => {
      expect(isSerializationFailure(error)).toBe(false);
      const $transaction = vi.fn().mockRejectedValue(error);
      await expect(
        runSerializableWithRetry({ $transaction }, vi.fn()),
      ).rejects.toBe(error);
      expect($transaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { code: 'P2034' },
    { name: 'DriverAdapterError', message: 'TransactionWriteConflict' },
  ])('preserves existing known serialization representations: %j', (error) => {
    expect(isSerializationFailure(error)).toBe(true);
  });
});
