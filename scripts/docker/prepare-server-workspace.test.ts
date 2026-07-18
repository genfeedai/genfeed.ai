import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  prepareServerWorkspace,
  resolveServerWorkspaceClosure,
} from './prepare-server-workspace';

type TestManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  private?: boolean;
};

describe('prepare-server-workspace', () => {
  let outputRoot = '';
  let repoRoot = '';
  let testRoot = '';

  beforeEach(() => {
    testRoot = mkdtempSync(path.join(tmpdir(), 'server-workspace-'));
    repoRoot = path.join(testRoot, 'repo');
    outputRoot = path.join(testRoot, 'output');
    mkdirSync(repoRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { force: true, recursive: true });
  });

  it('derives the transitive closure from every server workspace', () => {
    writeRootManifest({
      dependencies: {
        '@genfeedai/root-runtime': 'workspace:*',
        resend: '^6.9.3',
      },
      scripts: {
        postinstall: 'scripts/setup-skills.sh',
        test: 'vitest',
      },
      workspaces: ['apps/server/*', 'apps/app', 'packages/*', 'ee/packages/*'],
    });
    writeWorkspace('apps/server/api', {
      dependencies: { '@genfeedai/server': 'workspace:*' },
      name: '@genfeedai/api',
    });
    writeWorkspace('apps/server/server', {
      dependencies: { '@genfeedai/shared': 'workspace:*' },
      name: '@genfeedai/server',
    });
    writeWorkspace('apps/server/new-service', {
      devDependencies: { '@genfeedai/test-support': 'workspace:*' },
      name: '@genfeedai/new-service',
    });
    writeWorkspace('packages/shared', {
      optionalDependencies: { '@genfeedai/storage': 'workspace:*' },
      name: '@genfeedai/shared',
    });
    writeWorkspace('packages/storage', {
      name: '@genfeedai/storage',
      peerDependencies: { '@genfeedai/types': 'workspace:*' },
    });
    writeWorkspace('packages/types', { name: '@genfeedai/types' });
    writeWorkspace('packages/test-support', {
      name: '@genfeedai/test-support',
    });
    writeWorkspace('packages/root-runtime', {
      name: '@genfeedai/root-runtime',
    });
    writeWorkspace('packages/unrelated', { name: '@genfeedai/unrelated' });
    writeWorkspace('apps/app', {
      dependencies: { '@genfeedai/unrelated': 'workspace:*' },
      name: '@genfeedai/app',
    });
    writeWorkspace('ee/packages/billing', {
      name: '@genfeedai/billing',
    });

    const result = prepareServerWorkspace({
      outputRoot,
      repoRoot,
      seedWorkspacePaths: ['ee/packages/billing'],
    });

    expect(result.serverWorkspaceCount).toBe(3);
    expect(result.workspacePaths).toEqual([
      'apps/server/api',
      'apps/server/new-service',
      'apps/server/server',
      'ee/packages/billing',
      'packages/root-runtime',
      'packages/shared',
      'packages/storage',
      'packages/test-support',
      'packages/types',
    ]);
    expect(existsSync(path.join(outputRoot, 'apps/app/package.json'))).toBe(
      false,
    );
    expect(
      existsSync(path.join(outputRoot, 'packages/unrelated/package.json')),
    ).toBe(false);

    const preparedRoot = readJson(path.join(outputRoot, 'package.json'));
    expect(preparedRoot.workspaces).toEqual(result.workspacePaths);
    expect(preparedRoot.scripts).toEqual({ test: 'vitest' });
    expect(preparedRoot.dependencies).toEqual({
      '@genfeedai/root-runtime': 'workspace:*',
      resend: '6.9.3',
    });
  });

  it('fails when a workspace dependency is missing from the repository graph', () => {
    writeRootManifest({ workspaces: ['apps/server/*', 'packages/*'] });
    writeWorkspace('apps/server/api', {
      dependencies: { '@genfeedai/missing': 'workspace:*' },
      name: '@genfeedai/api',
    });

    expect(() => resolveServerWorkspaceClosure(repoRoot)).toThrow(
      'dependencies.@genfeedai/missing references a missing workspace package',
    );
  });

  it('fails when workspace package names are ambiguous', () => {
    writeRootManifest({ workspaces: ['apps/server/*', 'packages/*'] });
    writeWorkspace('apps/server/api', { name: '@genfeedai/api' });
    writeWorkspace('packages/api-shadow', { name: '@genfeedai/api' });

    expect(() => resolveServerWorkspaceClosure(repoRoot)).toThrow(
      'Duplicate workspace package name "@genfeedai/api"',
    );
  });

  it('fails when an explicit build-flavor seed is not a workspace', () => {
    writeRootManifest({ workspaces: ['apps/server/*', 'packages/*'] });
    writeWorkspace('apps/server/api', { name: '@genfeedai/api' });

    expect(() =>
      resolveServerWorkspaceClosure(repoRoot, ['ee/packages/billing']),
    ).toThrow(
      'seed workspace "ee/packages/billing" was not found in the root workspace graph',
    );
  });

  function writeRootManifest(
    manifest: {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      workspaces: string[];
    },
  ): void {
    writeJson('package.json', {
      name: 'fixture',
      private: true,
      ...manifest,
    });
  }

  function writeWorkspace(
    workspacePath: string,
    manifest: TestManifest,
  ): void {
    writeJson(`${workspacePath}/package.json`, {
      private: true,
      ...manifest,
    });
  }

  function writeJson(relativePath: string, value: object): void {
    const absolutePath = path.join(repoRoot, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(
      absolutePath,
      `${JSON.stringify(value, null, 2)}\n`,
      'utf8',
    );
  }
});

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}
