/** Ledger metadata keys that exist only for abuse checks, never for readers. */
const INTERNAL_LEDGER_METADATA_KEYS = new Set(['emailKey', 'ipKey']);

/** Drops the internal free-credit abuse keys from a ledger row's metadata. */
export function withoutInternalLedgerMetadata<T extends { metadata?: unknown }>(
  row: T,
): T {
  const { metadata } = row;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return row;
  }
  return {
    ...row,
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(
        ([key]) => !INTERNAL_LEDGER_METADATA_KEYS.has(key),
      ),
    ),
  };
}
