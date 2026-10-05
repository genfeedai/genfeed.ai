import type { Prisma } from '@genfeedai/prisma';
import { isRecord } from '@genfeedai/utils/data/extract.util';

// Postgres aborts a Serializable transaction (P2034, or the driver adapter's
// TransactionWriteConflict) when it overlaps a concurrent one. Sweeps that fire
// in the same second hit this in the hidden-mirror transaction, and a run with
// `attempts: 1` then fails for good, so the whole transaction is retried.
// Raw queries with adapter-pg wrap the same abort as P2010 with nested
// PostgreSQL SQLSTATE 40001; that exact representation is also retried.
//
// P2028 "Unable to start a transaction in the given time" means the pool could
// not hand out a connection before `maxWait` elapsed, so the callback never ran
// and re-running it is safe. Other P2028 variants (commit timeout, closed
// transaction) can leave the outcome unknown and are not retried. Pool
// pressure clears over seconds rather than milliseconds, so it backs off longer.
const MAX_SERIALIZABLE_ATTEMPTS = 5;
const SERIALIZABLE_BACKOFF_MS = 25;
const TRANSACTION_START_BACKOFF_MS = 500;

type SerializableClient = {
  $transaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: 'Serializable' },
  ): Promise<T>;
};

export function isSerializationFailure(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const { code, message, name } = error as Record<string, unknown>;
  return (
    code === 'P2034' ||
    (name === 'DriverAdapterError' && message === 'TransactionWriteConflict') ||
    isRawQuerySerializationFailure(error)
  );
}

function isRawQuerySerializationFailure(error: unknown): boolean {
  // adapter-pg wraps a raw-query PostgreSQL serialization abort as P2010.
  // Only this proven SQLSTATE denotes an aborted transaction safe to retry.
  if (!isRecord(error) || error.code !== 'P2010' || !isRecord(error.meta))
    return false;
  const adapterError = error.meta.driverAdapterError;
  return (
    isRecord(adapterError) &&
    isRecord(adapterError.cause) &&
    adapterError.cause.originalCode === '40001'
  );
}

export function isTransactionStartFailure(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const { code, message } = error as Record<string, unknown>;
  return (
    code === 'P2028' &&
    typeof message === 'string' &&
    message.includes('Unable to start a transaction')
  );
}

export async function runSerializableWithRetry<T>(
  prisma: SerializableClient,
  callback: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: 'Serializable',
      });
    } catch (error: unknown) {
      const isStartFailure = isTransactionStartFailure(error);
      if (
        !(isSerializationFailure(error) || isStartFailure) ||
        attempt >= MAX_SERIALIZABLE_ATTEMPTS
      ) {
        throw error;
      }
      // Jitter so the aborted runs do not collide again on the same tick.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (isStartFailure
            ? TRANSACTION_START_BACKOFF_MS
            : SERIALIZABLE_BACKOFF_MS) *
            attempt *
            (1 + Math.random()),
        ),
      );
    }
  }
}
