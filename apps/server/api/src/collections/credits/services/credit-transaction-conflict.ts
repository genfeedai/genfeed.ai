function isRetryableSqlState(code: unknown): boolean {
  return code === '40001' || code === '40P01';
}

export function isCreditTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
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
