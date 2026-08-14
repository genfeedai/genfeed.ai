import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCrossOrgUnsafeCheck } from './check-cross-org-unsafe';

describe('check-cross-org-unsafe', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'cross-org-unsafe-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags a new production crossOrgUnsafe call site', () => {
    writeFixture(
      'apps/server/api/src/admin/admin.service.ts',
      `
        import { crossOrgUnsafe } from '@libs/prisma/tenant-context';

        export async function listAll(prisma: { post: { findMany: () => Promise<unknown> } }): Promise<unknown> {
          return crossOrgUnsafe(() => prisma.post.findMany());
        }
      `,
    );

    const result = runCrossOrgUnsafeCheck({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'new-call',
        occurrence: expect.objectContaining({
          file: 'apps/server/api/src/admin/admin.service.ts',
        }),
      }),
    ]);
  });

  it('does not flag the function declaration itself', () => {
    writeFixture(
      'packages/libs/prisma/tenant-context.ts',
      `
        export function crossOrgUnsafe<T>(callback: () => T): T {
          return callback();
        }
      `,
    );

    const result = runCrossOrgUnsafeCheck({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.occurrences).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('passes when every call site is baselined', () => {
    writeFixture(
      'apps/server/api/src/admin/admin.service.ts',
      `
        export function run() {
          return crossOrgUnsafe(() => 1);
        }
      `,
    );

    const result = runCrossOrgUnsafeCheck({
      baseline: [
        { file: 'apps/server/api/src/admin/admin.service.ts', line: 3 },
      ],
      rootDir: testDir,
    });

    expect(result.violations).toEqual([]);
    expect(result.occurrences).toHaveLength(1);
  });

  it('flags stale baseline entries so the ratchet only shrinks', () => {
    writeFixture(
      'apps/server/api/src/admin/admin.service.ts',
      `
        export function run() {
          return 1;
        }
      `,
    );

    const result = runCrossOrgUnsafeCheck({
      baseline: [
        { file: 'apps/server/api/src/admin/gone.service.ts', line: 12 },
      ],
      rootDir: testDir,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'stale-baseline-entry',
      }),
    ]);
  });

  it('ignores spec files', () => {
    writeFixture(
      'packages/libs/prisma/tenant-guard.spec.ts',
      `
        it('hatch', () => {
          crossOrgUnsafe(() => undefined);
        });
      `,
    );

    const result = runCrossOrgUnsafeCheck({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.occurrences).toEqual([]);
  });

  function writeFixture(relativePath: string, contents: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
});
