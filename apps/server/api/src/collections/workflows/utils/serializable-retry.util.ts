import type { Prisma } from '@genfeedai/prisma';

// Postgres aborts a Serializable transaction (P2034, or the driver adapter's
// TransactionWriteConflict) when it overlaps a concurrent one. Sweeps that fire
// in the same second hit this in the hidden-mirror transaction, and a run with
// `attempts: 1` then fails for good, so the whole transaction is retried.
const MAX_SERIALIZABLE_ATTEMPTS = 5;
const SERIALIZABLE_BACKOFF_MS = 25;

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
    (name === 'DriverAdapterError' && message === 'TransactionWriteConflict')
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
      if (
        !isSerializationFailure(error) ||
        attempt >= MAX_SERIALIZABLE_ATTEMPTS
      ) {
        throw error;
      }
      // Jitter so the aborted runs do not collide again on the same tick.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          SERIALIZABLE_BACKOFF_MS * attempt * (1 + Math.random()),
        ),
      );
    }
  }
}
