function isRetryableSqlState(code: unknown): boolean {
  return code === '40001' || code === '40P01';
}

function isAdapterWriteConflict(error: object): boolean {
  // Prisma 7 adapter-pg raises ORM-level Serializable aborts as a top-level
  // DriverAdapterError (no `code`) whose message is the conflict kind.
  if (
    'name' in error &&
    error.name === 'DriverAdapterError' &&
    'message' in error &&
    error.message === 'TransactionWriteConflict'
  )
    return true;
  return (
    'cause' in error &&
    !!error.cause &&
    typeof error.cause === 'object' &&
    'originalCode' in error.cause &&
    isRetryableSqlState(error.cause.originalCode)
  );
}

export function isCreditTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (isAdapterWriteConflict(error)) return true;
  if (!('code' in error)) return false;
  if (error.code === 'P2034') return true;
  if (error.code !== 'P2010' || !('meta' in error)) return false;
  const metadata = error.meta;
  if (!metadata || typeof metadata !== 'object') return false;
  if ('code' in metadata && isRetryableSqlState(metadata.code)) return true;
  // Prisma 7 adapter-pg wraps raw wallet UPDATE SQLSTATE inside DriverAdapterError.
  if (!('driverAdapterError' in metadata)) return false;
  const adapterError = metadata.driverAdapterError;
  if (
    !adapterError ||
    typeof adapterError !== 'object' ||
    !('cause' in adapterError)
  )
    return false;
  const cause = adapterError.cause;
  return (
    !!cause &&
    typeof cause === 'object' &&
    'originalCode' in cause &&
    isRetryableSqlState(cause.originalCode)
  );
}
