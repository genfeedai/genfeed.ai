import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type CronBoundaryEntry,
  type PendingCronMigrationEntry,
  runCheckPlatformCronBoundary,
} from './check-platform-cron-boundary';

describe('check-platform-cron-boundary', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'cron-boundary-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags untracked static cron decorators', () => {
    writeFixture(
      'apps/server/api/src/foo.service.ts',
      `
        import { Cron } from '@nestjs/schedule';

        export class FooService {
          @Cron('* * * * *')
          async runTenantWork(): Promise<void> {}
        }
      `,
    );

    const result = runCheckPlatformCronBoundary({
      pendingMigrations: [],
      platformAllowlist: [],
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe('untracked-cron');
  });

  it('allows reviewed platform cron decorators', () => {
    writeFixture(
      'apps/server/workers/src/crons/platform.service.ts',
      `
        import { Cron } from '@nestjs/schedule';

        export class PlatformService {
          @Cron('* * * * *')
          async runMaintenance(): Promise<void> {}
        }
      `,
    );

    const platformAllowlist: CronBoundaryEntry[] = [
      {
        file: 'apps/server/workers/src/crons/platform.service.ts',
        id: 'platform-maintenance',
        methodName: 'runMaintenance',
        reason: 'Fixture platform maintenance cron.',
      },
    ];

    const result = runCheckPlatformCronBoundary({
      pendingMigrations: [],
      platformAllowlist,
    });

    expect(result.violations).toHaveLength(0);
    expect(result.platformCrons).toHaveLength(1);
  });

  it('allows tracked pending tenant migrations without treating them as platform crons', () => {
    writeFixture(
      'apps/server/workers/src/crons/product.service.ts',
      `
        import { Cron } from '@nestjs/schedule';

        export class ProductService {
          @Cron('* * * * *')
          async runTenantAutomation(): Promise<void> {}
        }
      `,
    );

    const pendingMigrations: PendingCronMigrationEntry[] = [
      {
        file: 'apps/server/workers/src/crons/product.service.ts',
        id: 'product-automation',
        issue: 123,
        methodName: 'runTenantAutomation',
        reason: 'Fixture pending tenant migration.',
      },
    ];

    const result = runCheckPlatformCronBoundary({
      pendingMigrations,
      platformAllowlist: [],
    });

    expect(result.violations).toHaveLength(0);
    expect(result.platformCrons).toHaveLength(0);
    expect(result.pendingMigrationCrons).toHaveLength(1);
  });

  it('detects stale manifest entries', () => {
    const platformAllowlist: CronBoundaryEntry[] = [
      {
        file: 'apps/server/workers/src/crons/missing.service.ts',
        id: 'missing',
        methodName: 'missingMethod',
        reason: 'Fixture stale entry.',
      },
    ];

    const result = runCheckPlatformCronBoundary({
      pendingMigrations: [],
      platformAllowlist,
    });

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe('stale-entry');
  });

  it('ignores commented cron text and test files', () => {
    writeFixture(
      'apps/server/api/src/commented.service.ts',
      `
        import { Cron } from '@nestjs/schedule';

        export class CommentedService {
          // @Cron('* * * * *')
          async runCommentedWork(): Promise<void> {}
        }
      `,
    );
    writeFixture(
      'apps/server/api/src/commented.service.spec.ts',
      `
        import { Cron } from '@nestjs/schedule';

        export class TestOnlyService {
          @Cron('* * * * *')
          async runTestWork(): Promise<void> {}
        }
      `,
    );

    const result = runCheckPlatformCronBoundary({
      pendingMigrations: [],
      platformAllowlist: [],
    });

    expect(result.detectedCrons).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  it('detects aliased Cron imports', () => {
    writeFixture(
      'apps/server/api/src/aliased.service.ts',
      `
        import { Cron as ScheduleCron } from '@nestjs/schedule';

        export class AliasedService {
          @ScheduleCron('* * * * *')
          async runAliasedWork(): Promise<void> {}
        }
      `,
    );

    const result = runCheckPlatformCronBoundary({
      pendingMigrations: [],
      platformAllowlist: [],
    });

    expect(result.detectedCrons).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe('untracked-cron');
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
