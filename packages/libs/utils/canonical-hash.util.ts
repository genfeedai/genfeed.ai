import { createHash } from 'node:crypto';

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit, no whitespace, and
 * `undefined` / functions / symbols serialized as `null` (at any depth).
 * Output feeds persisted integrity hashes and idempotency keys, so it must
 * stay byte-stable. Dates serialize as `{}` and bigint throws, exactly as the
 * original per-module copies did.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
