import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckLocalTypeGuards } from './check-local-type-guards';

describe('check-local-type-guards', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'local-type-guards-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  it('rejects a new local isRecord declaration', () => {
    write(
      'apps/server/api/src/foo.ts',
      'function isRecord(v: unknown): v is object { return !!v; }\n',
    );
    const { violations } = runCheckLocalTypeGuards({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['new-local-copy']);
  });

  it('flags arrow-function readString and readRecord copies', () => {
    write(
      'packages/foo/src/a.ts',
      'const readString = (v: unknown) => v;\nconst readRecord = (v: unknown) => v;\n',
    );
    const { violations } = runCheckLocalTypeGuards({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations[0]?.count).toBe(2);
  });

  it('allows baselined copies but rejects growth', () => {
    write(
      'apps/a.ts',
      'function asRecord(v: unknown) { return v; }\nfunction readString(v: unknown) { return v; }\n',
    );
    const baseline = { 'apps/a.ts': 1 };
    const { violations } = runCheckLocalTypeGuards({
      baseline,
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['new-local-copy']);
  });

  it('fails a stale baseline entry so the count only shrinks', () => {
    write('apps/a.ts', 'export const x = 1;\n');
    const { violations } = runCheckLocalTypeGuards({
      baseline: { 'apps/a.ts': 1 },
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['stale-baseline']);
  });

  it('ignores the shared helper file and test files', () => {
    write(
      'packages/utils/data/extract.util.ts',
      'export function isRecord(v: unknown) { return !!v; }\n',
    );
    write('apps/a.spec.ts', 'function isRecord(v: unknown) { return !!v; }\n');
    const { violations } = runCheckLocalTypeGuards({
      baseline: {},
      rootDir: testDir,
    });
    expect(violations).toEqual([]);
  });
});
