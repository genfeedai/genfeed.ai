/** Infinity from OSS stub can serialize as null/non-finite — never treat as wallet. */
export function coerceFiniteBalance(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
