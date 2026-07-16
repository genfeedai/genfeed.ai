import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  it('syncs includes to the newly created worktree when its path has spaces', () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'git-wt-review-'));
    const repository = path.join(fixtureRoot, 'repository');
    const existingWorktree = path.join(fixtureRoot, 'zzz-existing');
    const createdWorktree = path.join(fixtureRoot, 'aaa created with spaces');

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
          createdWorktree,
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

function runNodeGuard(source: string, version: string) {
  return spawnSync('node', ['-e', source, version], {
    encoding: 'utf8',
  });
}
