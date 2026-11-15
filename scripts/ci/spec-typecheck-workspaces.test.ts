import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverSpecWorkspaces,
  discoverSpecWorkspacesAcrossRoots,
  runSpecTypecheck,
} from './spec-typecheck-workspaces';

describe('spec-typecheck-workspaces', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'spec-typecheck-')));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function writeFixture(relativePath: string, content: string): void {
    const target = path.join(testDir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function writeWorkspace(name: string, root = 'apps/server'): void {
    writeFixture(
      `${root}/${name}/tsconfig.typecheck.specs.json`,
      JSON.stringify({
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
          strict: true,
          target: 'es2022',
        },
        include: ['src/**/*.ts'],
      }),
    );
  }

  describe('discoverSpecWorkspaces', () => {
    it('discovers only workspaces that opted in with a spec tsconfig', () => {
      writeWorkspace('api');
      writeFixture('apps/server/opted-out/src/main.ts', 'export const x = 1;');

      expect(discoverSpecWorkspaces(testDir, 'apps/server')).toEqual(['api']);
    });

    it('returns nothing when the workspaces directory is absent', () => {
      expect(discoverSpecWorkspaces(testDir, 'apps/server')).toEqual([]);
    });
  });

  describe('discoverSpecWorkspacesAcrossRoots', () => {
    it('merges workspaces enrolled under different roots', () => {
      writeWorkspace('api', 'apps/server');
      writeWorkspace('app', 'apps');
      writeWorkspace('ui', 'packages');

      const byWorkspace = discoverSpecWorkspacesAcrossRoots(testDir, [
        'apps/server',
        'apps',
        'packages',
      ]);

      expect(Object.fromEntries(byWorkspace)).toEqual({
        api: 'apps/server',
        app: 'apps',
        ui: 'packages',
      });
    });

    it('rejects the same workspace name enrolled under two roots', () => {
      writeWorkspace('ui', 'apps/server');
      writeWorkspace('ui', 'packages');

      expect(() =>
        discoverSpecWorkspacesAcrossRoots(testDir, ['apps/server', 'packages']),
      ).toThrow(/enrolled under both/u);
    });
  });

  describe('runSpecTypecheck', () => {
    it('fails a workspace whose spec calls a method the service does not have, and passes the others', () => {
      writeWorkspace('api');
      writeWorkspace('workers');
      writeFixture(
        'apps/server/api/src/models.service.ts',
        'export class ModelsService { patchAll(ids: string[]): number { return ids.length; } }\n',
      );
      writeFixture(
        'apps/server/api/src/models.service.spec.ts',
        "import { ModelsService } from './models.service';\nnew ModelsService().updateMany(['a'], {});\n",
      );
      writeFixture(
        'apps/server/workers/src/clean.spec.ts',
        'export const total: number = 1 + 1;\n',
      );

      const outcomes = runSpecTypecheck({
        rootDir: testDir,
        workspaces: ['api', 'workers'],
      });

      expect(
        outcomes.map(({ passed, workspace }) => ({ passed, workspace })),
      ).toEqual([
        { passed: false, workspace: 'api' },
        { passed: true, workspace: 'workers' },
      ]);
      expect(outcomes[0]?.output).toContain('models.service.spec.ts');
      expect(outcomes[0]?.output).toContain('updateMany');
    });

    it('checks every enrolled workspace when none is named', () => {
      writeWorkspace('api');
      writeWorkspace('ui', 'packages');
      writeFixture('apps/server/api/src/a.spec.ts', 'export const a = 1;\n');
      writeFixture('packages/ui/src/b.spec.ts', 'export const b = 2;\n');

      expect(
        runSpecTypecheck({ rootDir: testDir }).map(
          ({ workspace }) => workspace,
        ),
      ).toEqual(['api', 'ui']);
    });

    it('throws when a requested workspace has no spec tsconfig', () => {
      writeWorkspace('api');

      expect(() =>
        runSpecTypecheck({ rootDir: testDir, workspaces: ['missing'] }),
      ).toThrow(/missing/u);
    });
  });
});
