import { createHash } from 'node:crypto';

/** Stable JSON material snapshots: object ordering is irrelevant, array ordering is material. */
export function quoteSnapshotHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sorted(value)))
    .digest('hex');
}
function sorted(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sorted(entry)]),
    );
  }
  return value;
}
