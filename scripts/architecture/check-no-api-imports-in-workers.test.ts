import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckNoApiImportsInWorkers } from './check-no-api-imports-in-workers';

describe('check-no-api-imports-in-workers', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'workers-api-imports-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags @api imports that are not in the baseline', () => {
    writeFixture(
      'apps/server/workers/src/processors/foo.processor.ts',
      `
        import { FooService } from '@api/collections/foo/services/foo.service';

        export class FooProcessor {
          constructor(private readonly fooService: FooService) {}
        }
      `,
    );

    const result = runCheckNoApiImportsInWorkers({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe('new-import');
  });

  it('passes when every @api specifier is baselined', () => {
    writeFixture(
      'apps/server/workers/src/processors/foo.processor.ts',
      `
        import { FooService } from '@api/collections/foo/services/foo.service';

        export class FooProcessor {}
      `,
    );

    const result = runCheckNoApiImportsInWorkers({
      baseline: ['@api/collections/foo/services/foo.service'],
      rootDir: testDir,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.usedSpecifiers).toEqual([
      '@api/collections/foo/services/foo.service',
    ]);
  });

  it('flags stale baseline entries so the ratchet only shrinks', () => {
    writeFixture(
      'apps/server/workers/src/main.ts',
      `
        export const bootstrap = (): void => {};
      `,
    );

    const result = runCheckNoApiImportsInWorkers({
      baseline: ['@api/collections/gone/services/gone.service'],
      rootDir: testDir,
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe('stale-baseline-entry');
  });

  it('detects export-from, dynamic import, and type-only imports', () => {
    writeFixture(
      'apps/server/workers/src/exports.ts',
      `
        export { Thing } from '@api/helpers/thing';
      `,
    );
    writeFixture(
      'apps/server/workers/src/dynamic.ts',
      `
        export async function load(): Promise<unknown> {
          return import('@api/services/lazy/lazy.service');
        }
      `,
    );
    writeFixture(
      'apps/server/workers/src/types-only.ts',
      `
        import type { Shape } from '@api/types/shape';

        export const useShape = (shape: Shape): Shape => shape;
      `,
    );

    const result = runCheckNoApiImportsInWorkers({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.usedSpecifiers).toEqual([
      '@api/helpers/thing',
      '@api/services/lazy/lazy.service',
      '@api/types/shape',
    ]);
    expect(result.violations).toHaveLength(3);
  });

  it('ignores non-@api specifiers', () => {
    writeFixture(
      'apps/server/workers/src/clean.ts',
      `
        import { QueueNames } from '@genfeedai/queue-contracts';
        import { CircuitBreaker } from '@libs/adapters/circuit-breaker';

        export const queues = { CircuitBreaker, QueueNames };
      `,
    );

    const result = runCheckNoApiImportsInWorkers({
      baseline: [],
      rootDir: testDir,
    });

    expect(result.occurrences).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  function writeFixture(relativePath: string, contents: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
});
