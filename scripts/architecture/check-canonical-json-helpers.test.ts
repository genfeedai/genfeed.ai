import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckCanonicalJsonHelpers } from './check-canonical-json-helpers';

describe('check-canonical-json-helpers', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'canonical-json-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  it('rejects a new named local stableStringify', () => {
    write(
      'apps/server/api/src/foo/foo.ts',
      'function stableStringify(v: unknown): string { return JSON.stringify(v); }\n',
    );
    const { violations } = runCheckCanonicalJsonHelpers({
      allowances: [],
      rootDir: testDir,
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('local-canonicalizer');
  });

  it('rejects a differently named recursive key sort by signature', () => {
    write(
      'packages/foo/src/digest.ts',
      [
        'export function digestPreimage(r: Record<string, unknown>): string {',
        '  return Object.keys(r)',
        '    .sort()',
        '    .map((key) => JSON.stringify(key) + String(r[key]))',
        "    .join(',');",
        '}',
      ].join('\n'),
    );
    const { violations } = runCheckCanonicalJsonHelpers({
      allowances: [],
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['local-canonicalizer']);
  });

  it('rejects sorted-key rebuilds via reduce', () => {
    write(
      'packages/foo/src/digest-reduce.ts',
      [
        'export function digestCanonical(r: Record<string, unknown>): string {',
        '  const sorted = Object.keys(r)',
        '    .sort()',
        '    .reduce<Record<string, unknown>>((acc, key) => {',
        '      acc[key] = r[key];',
        '      return acc;',
        '    }, {});',
        '  return JSON.stringify(sorted);',
        '}',
      ].join('\n'),
    );
    const { violations } = runCheckCanonicalJsonHelpers({
      allowances: [],
      rootDir: testDir,
    });
    expect(violations.map((v) => v.kind)).toEqual(['local-canonicalizer']);
  });

  it('allows the shared helper and documented allowances, and flags stale ones', () => {
    write(
      'packages/libs/utils/canonical-hash.util.ts',
      'export function stableStringify(v: unknown): string { return String(v); }\n',
    );
    write(
      'packages/actions/src/legacy.ts',
      'function stableStringify(v: unknown): string { return String(v); }\n',
    );
    const allowed = runCheckCanonicalJsonHelpers({
      allowances: [{ file: 'packages/actions/src/legacy.ts', reason: 'test' }],
      rootDir: testDir,
    });
    expect(allowed.violations).toEqual([]);

    const stale = runCheckCanonicalJsonHelpers({
      allowances: [
        { file: 'packages/actions/src/legacy.ts', reason: 'test' },
        { file: 'packages/actions/src/gone.ts', reason: 'test' },
      ],
      rootDir: testDir,
    });
    expect(stale.violations.map((v) => v.kind)).toEqual(['stale-allowance']);
  });
});
