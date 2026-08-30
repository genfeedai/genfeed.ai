import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

interface PackageManifest {
  scripts?: Record<string, string>;
}

describe('package and worktree review follow-ups', () => {
  it('resolves a bare name (with spaces) to <repo>/.worktrees/<name> and syncs includes there', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'git-wt-review-'));
    const repository = path.join(fixtureRoot, 'repository');
    const existingWorktree = path.join(fixtureRoot, 'zzz-existing');
    const worktreeName = 'aaa created with spaces';
    const createdWorktree = path.join(repository, '.worktrees', worktreeName);

    try {
      initializeFixtureRepository(repository);
      runGit(repository, [
        'worktree',
        'add',
        '--detach',
        existingWorktree,
        'HEAD',
      ]);

      execFileSync(
        'bash',
        [
          path.join(repository, 'scripts/git-wt.sh'),
          '-b',
          'fixture-branch',
          worktreeName,
          'HEAD',
        ],
        { cwd: repository, stdio: 'pipe' },
      );

      expect(
        readFileSync(path.join(createdWorktree, '.fixture-env'), 'utf8'),
      ).toBe('fixture-value\n');
      expect(existsSync(path.join(existingWorktree, '.fixture-env'))).toBe(
        false,
      );
      expect(readJson('package.json').scripts?.['wt:setup']).toContain(
        'scripts/git-wt.sh',
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('refuses worktree paths outside <repo>/.worktrees/', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'git-wt-outside-'));
    const repository = path.join(fixtureRoot, 'repository');
    const outsideWorktree = path.join(fixtureRoot, 'sibling-worktree');

    try {
      initializeFixtureRepository(repository);

      const result = spawnSync(
        'bash',
        [
          path.join(repository, 'scripts/git-wt.sh'),
          '-b',
          'fixture-branch',
          outsideWorktree,
          'HEAD',
        ],
        { cwd: repository, encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('direct children of');
      expect(existsSync(outsideWorktree)).toBe(false);
      expect(listWorktrees(repository)).toEqual([realpathSync(repository)]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('refuses the legacy .claude/worktrees path', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'git-wt-claude-'));
    const repository = path.join(fixtureRoot, 'repository');
    const claudeWorktree = path.join(
      repository,
      '.claude',
      'worktrees',
      'legacy-location',
    );

    try {
      initializeFixtureRepository(repository);

      const result = spawnSync(
        'bash',
        [
          path.join(repository, 'scripts/git-wt.sh'),
          '-b',
          'fixture-branch',
          claudeWorktree,
          'HEAD',
        ],
        { cwd: repository, encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('direct children of');
      expect(existsSync(claudeWorktree)).toBe(false);
      expect(listWorktrees(repository)).toEqual([realpathSync(repository)]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('never nests: from inside a worktree a bare name lands in the primary .worktrees/', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'git-wt-nested-'));
    const repository = path.join(fixtureRoot, 'repository');
    const firstWorktree = path.join(repository, '.worktrees', 'first');
    const secondWorktree = path.join(repository, '.worktrees', 'second');

    try {
      initializeFixtureRepository(repository);
      runGit(repository, [
        'worktree',
        'add',
        '--detach',
        firstWorktree,
        'HEAD',
      ]);

      execFileSync(
        'bash',
        [
          path.join(repository, 'scripts/git-wt.sh'),
          '--detach',
          'second',
          'HEAD',
        ],
        { cwd: firstWorktree, stdio: 'pipe' },
      );
      const nested = spawnSync(
        'bash',
        [
          path.join(repository, 'scripts/git-wt.sh'),
          '--detach',
          './nested',
          'HEAD',
        ],
        { cwd: firstWorktree, encoding: 'utf8' },
      );

      expect(existsSync(path.join(secondWorktree, '.fixture-env'))).toBe(true);
      expect(nested.status).toBe(1);
      expect(nested.stderr).toContain('direct children of');
      expect(existsSync(path.join(firstWorktree, 'nested'))).toBe(false);
      expect(listWorktrees(repository).sort()).toEqual(
        [repository, firstWorktree, secondWorktree]
          .map((worktree) => realpathSync(worktree))
          .sort(),
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports worktree include copy failures', () => {
    const fixtureRoot = mkdtempSync(
      path.join(tmpdir(), 'worktree-copy-failure-'),
    );
    const repository = path.join(fixtureRoot, 'repository');
    const worktree = path.join(fixtureRoot, 'worktree');
    const fakeBin = path.join(fixtureRoot, 'bin');

    try {
      initializeFixtureRepository(repository);
      runGit(repository, ['worktree', 'add', '--detach', worktree, 'HEAD']);
      mkdirSync(fakeBin);
      const fakeCopy = path.join(fakeBin, 'cp');
      writeFileSync(
        fakeCopy,
        '#!/usr/bin/env sh\nprintf "partial\\n" > "$2"\nexit 1\n',
      );
      chmodSync(fakeCopy, 0o755);

      const result = spawnSync(
        'bash',
        [path.join(repository, 'scripts/sync-worktree-includes.sh'), worktree],
        {
          cwd: repository,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          },
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('failed to copy .fixture-env');
      expect(result.stdout).toContain('1 failed');
      expect(existsSync(path.join(worktree, '.fixture-env'))).toBe(false);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('requires npm 11.5.1 in both release jobs', () => {
    const workflow = readText('.github/workflows/publish-packages.yml');
    const guards = Array.from(
      workflow.matchAll(/node -e '\n([\s\S]*?)\n\s+' "\$\(npm --version\)"/g),
      (match) => match[1],
    );

    expect(guards).toHaveLength(2);
    for (const guard of guards) {
      expect(runNodeGuard(guard, '11.5.0').status).not.toBe(0);
      expect(runNodeGuard(guard, '11.5.1').status).toBe(0);
      expect(runNodeGuard(guard, '12.0.0').status).toBe(0);
    }
  });

  it('installs release-script dependencies before publishing tarballs', () => {
    const workflow = readText('.github/workflows/publish-packages.yml');
    const publishJob = workflow.split('\n  publish:\n')[1];

    expect(publishJob).toBeDefined();
    const setupIndex = publishJob?.indexOf(
      'uses: ./.github/actions/setup-bun-env',
    );
    const publishIndex = publishJob?.indexOf(
      'node scripts/publish-packages-from-json.mjs',
    );

    expect(setupIndex).toBeGreaterThanOrEqual(0);
    expect(publishIndex).toBeGreaterThan(setupIndex ?? -1);
    expect(publishJob).toContain("node-version: '24.x'");
    expect(publishJob).not.toContain('bun-version:');
    expect(publishJob).toContain(
      "install-command: 'bun install --frozen-lockfile'",
    );
    expect(publishJob).not.toContain('uses: actions/setup-node@');
  });

  it('authorizes real npm publishes through an explicit release-call contract', () => {
    const packageWorkflow = readText('.github/workflows/publish-packages.yml');
    const releaseWorkflow = readText('.github/workflows/release.yml');

    expect(packageWorkflow).toContain('trusted_release_call:');
    expect(packageWorkflow).toContain(
      'inputs.dry_run == false && inputs.trusted_release_call != true',
    );
    expect(packageWorkflow).toContain(
      "inputs.validated_historical_recovery != true && inputs.dry_run == false && inputs.trusted_release_call == true && needs.plan.outputs.has_packages == 'true'",
    );
    expect(packageWorkflow).not.toContain(
      "github.event_name == 'workflow_dispatch' && inputs.dry_run == false",
    );
    expect(releaseWorkflow).toContain('trusted_release_call: true');
  });

  it('allows historical recovery only when the current controller proves npm is a no-op', () => {
    const dollar = '$';
    const packageWorkflow = readText('.github/workflows/publish-packages.yml');
    const releaseWorkflow = readText('.github/workflows/release.yml');
    const workflowCall = packageWorkflow
      .split('  workflow_call:\n')[1]
      ?.split('  workflow_dispatch:\n')[0];
    const workflowDispatch = packageWorkflow
      .split('  workflow_dispatch:\n')[1]
      ?.split('\nconcurrency:\n')[0];
    const planJob = packageWorkflow
      .split('\n  plan:\n')[1]
      ?.split('\n  preflight:\n')[0];
    const preflightJob = packageWorkflow
      .split('\n  preflight:\n')[1]
      ?.split('\n  publish:\n')[0];
    const publishJob = packageWorkflow.split('\n  publish:\n')[1];

    expect(workflowCall).toContain('validated_historical_recovery:');
    expect(workflowCall).toMatch(
      /validated_historical_recovery:[\s\S]*?default: false[\s\S]*?type: boolean/,
    );
    expect(workflowCall).toContain('recovery_run_id:');
    expect(workflowCall).toMatch(
      /recovery_run_id:[\s\S]*?default: ''[\s\S]*?type: string/,
    );
    expect(workflowDispatch).not.toContain('validated_historical_recovery');
    expect(workflowDispatch).not.toContain('recovery_run_id');

    expect(planJob).toContain(
      `if: ${dollar}{{ inputs.dry_run == false || inputs.validated_historical_recovery == true }}`,
    );
    expect(planJob).toContain(
      `VALIDATED_HISTORICAL_RECOVERY: ${dollar}{{ inputs.validated_historical_recovery }}`,
    );
    expect(planJob).toContain(
      `git merge-base --is-ancestor "${dollar}{HEAD_SHA}" "${dollar}{MASTER_SHA}"`,
    );
    expect(planJob).toContain('- name: Checkout current release controller');
    expect(planJob).toContain(`ref: ${dollar}{{ github.sha }}`);
    expect(planJob).toContain('path: .release-controller');
    expect(planJob).toContain(
      `HAS_PACKAGES: ${dollar}{{ steps.plan.outputs.has_packages }}`,
    );
    expect(planJob).toContain(
      'run: node .release-controller/scripts/ci/recovery-npm-plan-guard.mjs',
    );

    expect(preflightJob).toContain(
      `if: ${dollar}{{ inputs.validated_historical_recovery != true && needs.plan.outputs.has_packages == 'true' }}`,
    );
    expect(publishJob).toContain(
      `if: ${dollar}{{ inputs.validated_historical_recovery != true && inputs.dry_run == false`,
    );
    expect(publishJob).toContain(
      `[ "${dollar}{HEAD_SHA}" != "${dollar}{CHECKOUT_REF}" ]`,
    );
    expect(publishJob).toContain('git fetch --no-tags origin master');
    expect(publishJob).toContain(
      `[ "${dollar}{HEAD_SHA}" != "${dollar}{MASTER_SHA}" ]`,
    );
    expect(publishJob).not.toContain('git merge-base --is-ancestor');
    expect(publishJob).not.toContain('validated historical recovery');

    expect(releaseWorkflow).toContain(
      `validated_historical_recovery: ${dollar}{{ needs.validate-release.outputs.recovery_mode == 'true' }}`,
    );
    expect(releaseWorkflow).toContain(
      `recovery_run_id: ${dollar}{{ needs.validate-release.outputs.recovery_run_id }}`,
    );
  });
});

function readJson(relativePath: string): PackageManifest {
  return JSON.parse(readText(relativePath)) as PackageManifest;
}

function readText(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function initializeFixtureRepository(repository: string): void {
  mkdirSync(repository);
  mkdirSync(path.join(repository, 'scripts'));
  runGit(repository, ['init', '--quiet']);
  runGit(repository, ['config', 'user.name', 'Worktree Test']);
  runGit(repository, ['config', 'user.email', 'worktree-test@example.com']);
  writeFileSync(path.join(repository, '.gitignore'), '.fixture-env\n');
  writeFileSync(path.join(repository, '.worktreeinclude'), '.fixture-env\n');
  writeFileSync(path.join(repository, '.fixture-env'), 'fixture-value\n');
  writeFileSync(path.join(repository, 'tracked.txt'), 'tracked\n');
  for (const scriptName of ['git-wt.sh', 'sync-worktree-includes.sh']) {
    const fixtureScript = path.join(repository, 'scripts', scriptName);
    writeFileSync(fixtureScript, readText(`scripts/${scriptName}`));
    chmodSync(fixtureScript, 0o755);
  }
  runGit(repository, [
    'add',
    '.gitignore',
    '.worktreeinclude',
    'scripts/git-wt.sh',
    'scripts/sync-worktree-includes.sh',
    'tracked.txt',
  ]);
  runGit(repository, ['commit', '--quiet', '-m', 'fixture']);
}

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function listWorktrees(repository: string): string[] {
  return execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repository,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length));
}

function runNodeGuard(source: string, version: string) {
  return spawnSync('node', ['-e', source, version], {
    encoding: 'utf8',
  });
}
