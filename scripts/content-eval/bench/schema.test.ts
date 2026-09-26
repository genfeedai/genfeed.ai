import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BENCH_REVISION, BENCH_SCHEMA_PATH } from './schema';
import { normalizeSource, readBenchFileAtRevision } from './schema-drift';

const MARKER = '// ── verbatim below:';

describe('pinned bench schema', () => {
  it('pins a full commit SHA', () => {
    expect(BENCH_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });

  const upstream = readBenchFileAtRevision(BENCH_SCHEMA_PATH);

  it.skipIf(upstream === null)(
    'is verbatim genfeedai/benchmark schema/index.ts at BENCH_REVISION',
    () => {
      const pinned = readFileSync(
        fileURLToPath(new URL('./schema.ts', import.meta.url)),
        'utf8',
      );
      const markerIndex = pinned.indexOf(MARKER);
      const body = pinned.slice(pinned.indexOf('\n', markerIndex) + 1);

      expect(normalizeSource(body)).toBe(normalizeSource(upstream ?? ''));
    },
  );
});
