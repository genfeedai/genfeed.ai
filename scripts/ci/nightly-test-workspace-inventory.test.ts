import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildNightlyTestWorkspaceInventory,
  type NightlyTestExclusion,
} from './nightly-test-workspace-inventory';

describe('nightly test workspace inventory', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'nightly-test-inventory-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('classifies every test-capable workspace deterministically', () => {
    writeRootManifest([
      'apps/server/*',
      'apps/app',
      'apps/docs',
      'apps/extensions/*/app',
      'packages/*',
    ]);
    writeWorkspace('packages/helpers', '@genfeedai/helpers');
    writeWorkspace('apps/server/files', '@genfeedai/files');
    writeWorkspace('apps/server/api', '@genfeedai/api');
    writeWorkspace(
      'apps/extensions/browser/app',
      '@genfeedai/extension-browser',
    );
    writeWorkspace('apps/docs', '@genfeedai/docs');
    writeWorkspace('apps/app', '@genfeedai/app');

    const result = buildNightlyTestWorkspaceInventory({
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([]);
    expect(
      result.workspaces.map(({ path: workspacePath }) => workspacePath),
    ).toEqual([
      'apps/app',
      'apps/docs',
      'apps/extensions/browser/app',
      'apps/server/api',
      'apps/server/files',
      'packages/helpers',
    ]);
    expect(result.summary.byClass).toEqual({
      api: 1,
      app: 1,
      client: 1,
      extension: 1,
      package: 1,
      'server-service': 1,
    });
    expect(result.workspaces[0]).toMatchObject({
      command: 'bun run --cwd apps/app test',
      manifestCommand: 'vitest run',
      name: '@genfeedai/app',
      workspaceClass: 'app',
    });
  });

  it('fails when a test-capable workspace has no inventory classification', () => {
    writeRootManifest(['tools/*']);
    writeWorkspace('tools/runner', '@genfeedai/test-runner');

    const result = buildNightlyTestWorkspaceInventory({
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'missing-workspace-classification',
        path: 'tools/runner',
      }),
    ]);
  });

  it('fails when root workspace patterns classify the same path twice', () => {
    writeRootManifest(['packages/*', 'packages/helpers']);
    writeWorkspace('packages/helpers', '@genfeedai/helpers');

    const result = buildNightlyTestWorkspaceInventory({
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'duplicate-workspace',
        path: 'packages/helpers',
      }),
    ]);
  });

  it('requires complete exclusion ownership and review metadata', () => {
    writeRootManifest(['packages/*']);
    writeWorkspace('packages/helpers', '@genfeedai/helpers');
    const exclusions: NightlyTestExclusion[] = [
      {
        owner: '',
        path: 'packages/helpers',
        reason: 'short',
        reviewDate: 'soon',
        trackingIssue: 0,
      },
    ];

    const result = buildNightlyTestWorkspaceInventory({
      exclusions,
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'invalid-exclusion',
        path: 'packages/helpers',
      }),
    ]);
  });

  it('classifies a fully owned exclusion separately from executable workspaces', () => {
    writeRootManifest(['packages/*']);
    writeWorkspace('packages/helpers', '@genfeedai/helpers');
    const exclusions = [validExclusion()];

    const result = buildNightlyTestWorkspaceInventory({
      exclusions,
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([]);
    expect(result.workspaces).toEqual([]);
    expect(result.excluded).toEqual(exclusions);
  });

  it('fails when an exclusion no longer matches a test-capable workspace', () => {
    writeRootManifest(['packages/*']);
    writeWorkspace('packages/helpers', '@genfeedai/helpers', null);
    const exclusions = [validExclusion()];

    const result = buildNightlyTestWorkspaceInventory({
      exclusions,
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'stale-exclusion',
        path: 'packages/helpers',
      }),
    ]);
  });

  it('rejects test commands that suppress failures', () => {
    writeRootManifest(['packages/*']);
    writeWorkspace(
      'packages/helpers',
      '@genfeedai/helpers',
      'vitest run || true',
    );

    const result = buildNightlyTestWorkspaceInventory({
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'invalid-command',
        path: 'packages/helpers',
      }),
    ]);
  });

  it('does not allow an exclusion to hide a suppressed test command', () => {
    writeRootManifest(['packages/*']);
    writeWorkspace(
      'packages/helpers',
      '@genfeedai/helpers',
      'vitest run || true',
    );

    const result = buildNightlyTestWorkspaceInventory({
      exclusions: [validExclusion()],
      rootDir: testDir,
      today: '2026-07-20',
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'invalid-command',
        path: 'packages/helpers',
      }),
    ]);
    expect(result.excluded).toEqual([]);
  });

  function writeRootManifest(workspaces: string[]): void {
    writeJson('package.json', { private: true, workspaces });
  }

  function writeWorkspace(
    workspacePath: string,
    name: string,
    testCommand: string | null = 'vitest run',
  ): void {
    writeJson(`${workspacePath}/package.json`, {
      name,
      scripts: testCommand ? { test: testCommand } : {},
    });
  }

  function writeJson(relativePath: string, value: unknown): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
});

function validExclusion(): NightlyTestExclusion {
  return {
    owner: '@genfeedai/ci',
    path: 'packages/helpers',
    reason: 'Tracked fixture exclusion pending hermetic test coverage.',
    reviewDate: '2026-08-20',
    trackingIssue: 1927,
  };
}
