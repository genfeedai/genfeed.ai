import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkTypecheckPrerequisites,
  isMissingRequiredTurboInvocation,
} from './check-typecheck-prerequisites';

const testDirs: string[] = [];
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../..');

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'typecheck-prerequisites-'));
  testDirs.push(rootDir);
  writeFileSync(path.join(rootDir, 'turbo.json'), '{}');

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('typecheck prerequisite guard', () => {
  it('requires Turbo only for workspaces with a self-declaration boundary', () => {
    expect(
      isMissingRequiredTurboInvocation(['--require-turbo'], undefined),
    ).toBe(true);
    expect(
      isMissingRequiredTurboInvocation(['--require-turbo'], 'task-hash'),
    ).toBe(false);
    expect(isMissingRequiredTurboInvocation([], undefined)).toBe(false);
  });

  it('builds server declarations before its Turbo-managed typecheck', () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(REPOSITORY_ROOT, 'apps/server/api/package.json'),
        'utf8',
      ),
    ) as { scripts: Record<string, string> };
    const turboConfig = JSON.parse(
      readFileSync(
        path.join(REPOSITORY_ROOT, 'apps/server/api/turbo.json'),
        'utf8',
      ),
    ) as { tasks: { 'type-check': { dependsOn: string[] } } };

    expect(manifest.scripts['type-check']).toContain('--require-turbo');
    expect(manifest.scripts['type-check']).not.toContain('bun run build');
    expect(turboConfig.tasks['type-check'].dependsOn).toEqual([
      'build',
      '^build',
    ]);
  });

  it('accepts a workspace with no declaration-producing dependencies', () => {
    const rootDir = fixture({
      'packages/consumer/package.json': JSON.stringify({
        dependencies: { external: '1.0.0' },
        name: '@genfeedai/consumer',
      }),
    });

    expect(
      checkTypecheckPrerequisites({
        rootDir,
        workspaceDir: path.join(rootDir, 'packages/consumer'),
      }),
    ).toEqual([]);
  });

  it('reports a missing workspace declaration target', () => {
    const rootDir = fixture({
      'packages/consumer/package.json': JSON.stringify({
        dependencies: { '@genfeedai/contracts': 'workspace:*' },
        name: '@genfeedai/consumer',
      }),
      'packages/contracts/package.json': JSON.stringify({
        name: '@genfeedai/contracts',
        types: './dist/index.d.ts',
      }),
    });

    expect(
      checkTypecheckPrerequisites({
        rootDir,
        workspaceDir: path.join(rootDir, 'packages/consumer'),
      }),
    ).toEqual([
      {
        dependency: '@genfeedai/contracts',
        expectedPath: 'packages/contracts/dist/index.d.ts',
      },
    ]);
  });

  it('accepts built wildcard declaration exports', () => {
    const rootDir = fixture({
      'packages/consumer/package.json': JSON.stringify({
        dependencies: { '@genfeedai/libs': 'workspace:*' },
        name: '@genfeedai/consumer',
      }),
      'packages/libs/dist/logger/logger.d.ts':
        'export declare const logger: unknown;',
      'packages/libs/package.json': JSON.stringify({
        exports: { './*': { types: './dist/*.d.ts' } },
        name: '@genfeedai/libs',
      }),
    });

    expect(
      checkTypecheckPrerequisites({
        rootDir,
        workspaceDir: path.join(rootDir, 'packages/consumer'),
      }),
    ).toEqual([]);
  });

  it('rejects an empty wildcard declaration directory', () => {
    const rootDir = fixture({
      'packages/consumer/package.json': JSON.stringify({
        dependencies: { '@genfeedai/libs': 'workspace:*' },
        name: '@genfeedai/consumer',
      }),
      'packages/libs/dist/.gitkeep': '',
      'packages/libs/package.json': JSON.stringify({
        exports: { './*': { types: './dist/*.d.ts' } },
        name: '@genfeedai/libs',
      }),
    });

    expect(
      checkTypecheckPrerequisites({
        rootDir,
        workspaceDir: path.join(rootDir, 'packages/consumer'),
      }),
    ).toEqual([
      {
        dependency: '@genfeedai/libs',
        expectedPath: 'packages/libs/dist/*.d.ts',
      },
    ]);
  });

  it('checks named declaration export conditions', () => {
    const rootDir = fixture({
      'packages/agent/package.json': JSON.stringify({
        exports: {
          '.': { types: './src/index.ts' },
          './server': { types: './dist/server/server.d.ts' },
        },
        name: '@genfeedai/agent',
      }),
      'packages/consumer/package.json': JSON.stringify({
        dependencies: { '@genfeedai/agent': 'workspace:*' },
        name: '@genfeedai/consumer',
      }),
    });

    expect(
      checkTypecheckPrerequisites({
        rootDir,
        workspaceDir: path.join(rootDir, 'packages/consumer'),
      }),
    ).toEqual([
      {
        dependency: '@genfeedai/agent',
        expectedPath: 'packages/agent/dist/server/server.d.ts',
      },
    ]);
  });
});
