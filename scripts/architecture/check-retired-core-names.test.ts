import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkRetiredCoreNames } from './check-retired-core-names';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'retired-core-names-'));
  testDirs.push(rootDir);

  for (const [file, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, source);
  }

  return rootDir;
}

describe('retired core/server name guard', () => {
  it('accepts the canonical api and workflows boundaries', () => {
    const rootDir = fixture({
      'apps/server/api/src/example.ts': [
        "import { BaseService } from '@api/shared/services/base/base.service';",
        "import { runWorkflow } from '@genfeedai/workflows/engine';",
        "import { useAuth } from '@genfeedai/services-client';",
      ].join('\n'),
      'packages/services/core/base.service.ts': 'export class BaseService {}',
      'packages/interfaces/dist/core/index.js': 'module.exports = {};',
      'packages/workflows/package.json': '{ "name": "@genfeedai/workflows" }',
    });

    expect(checkRetiredCoreNames({ rootDir })).toEqual([]);
  });

  it('rejects a retired package directory that holds source again', () => {
    const rootDir = fixture({
      'apps/server/server/src/index.ts': 'export {};',
      'packages/workflow-engine/node_modules/x/index.js': '',
    });

    expect(checkRetiredCoreNames({ rootDir })).toEqual([
      { kind: 'retired-directory', path: 'apps/server/server' },
    ]);
  });

  it('rejects a manifest named after a retired package', () => {
    const rootDir = fixture({
      'packages/shared/package.json': '{ "name": "@genfeedai/core" }',
    });

    expect(checkRetiredCoreNames({ rootDir })).toEqual([
      {
        file: 'packages/shared/package.json',
        kind: 'retired-package-name',
        name: '@genfeedai/core',
      },
    ]);
  });

  it('rejects imports, dependencies and path aliases naming retired packages', () => {
    const rootDir = fixture({
      'apps/server/workers/src/example.ts': [
        "import { X } from '@genfeedai/server/services/x';",
        "import { Y } from '@server/services/y';",
        "const ui = await import('@genfeedai/workflow-ui');",
      ].join('\n'),
      'apps/server/workers/tsconfig.json':
        '{ "compilerOptions": { "paths": { "@server/*": ["../server/src/*"] } } }',
      'packages/tools/package.json':
        '{ "name": "@genfeedai/tools", "dependencies": { "@genfeedai/core": "workspace:*" } }',
    });

    expect(checkRetiredCoreNames({ rootDir })).toEqual([
      {
        file: 'apps/server/workers/src/example.ts',
        kind: 'retired-specifier',
        line: 1,
        specifier: '@genfeedai/server',
      },
      {
        file: 'apps/server/workers/src/example.ts',
        kind: 'retired-specifier',
        line: 2,
        specifier: '@server',
      },
      {
        file: 'apps/server/workers/src/example.ts',
        kind: 'retired-specifier',
        line: 3,
        specifier: '@genfeedai/workflow-ui',
      },
      {
        file: 'apps/server/workers/tsconfig.json',
        kind: 'retired-specifier',
        line: 1,
        specifier: '@server',
      },
      {
        file: 'packages/tools/package.json',
        kind: 'retired-specifier',
        line: 1,
        specifier: '@genfeedai/core',
      },
    ]);
  });

  it('rejects a new directory named core', () => {
    const rootDir = fixture({
      'packages/agent/src/core/runtime.ts': 'export {};',
    });

    expect(checkRetiredCoreNames({ rootDir })).toEqual([
      { kind: 'new-core-directory', path: 'packages/agent/src/core' },
    ]);
  });
});
