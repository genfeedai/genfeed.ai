import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOOK_PATH = path.join(
  REPOSITORY_ROOT,
  '.claude/hooks/check-tenant-scope.py',
);
const PYTHON_PATH = executablePath('python3');
const GIT_PATH = executablePath('git');

describe('check-tenant-scope PostToolUse hook', () => {
  let testDir = '';
  let fakeBinDir = '';
  let invocationLog = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'tenant-scope-hook-'));
    fakeBinDir = path.join(testDir, 'fake-bin');
    invocationLog = path.join(testDir, 'bun-invocations.log');
    mkdirSync(fakeBinDir, { recursive: true });

    const gitInit = spawnSync(GIT_PATH, ['init', '--quiet', testDir], {
      encoding: 'utf8',
    });
    if (gitInit.status !== 0) {
      throw new Error(`Unable to initialize hook fixture: ${gitInit.stderr}`);
    }

    writeFakeBun(fakeBinDir);
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('skips edits outside the canonical tenant-scope scan surface', () => {
    const result = runHook('apps/app/src/page.ts');

    expect(result.status).toBe(0);
    expect(readInvocationLog()).toBe('');
  });

  it.each([
    'apps/server/api/src/example.service.spec.ts',
    'apps/server/api/src/example.service.test.ts',
    'apps/server/api/src/fixtures/example.service.ts',
    'apps/server/api/src/generated/example.service.ts',
  ])('skips ignored in-surface file %s', (relativePath) => {
    const result = runHook(relativePath);

    expect(result.status).toBe(0);
    expect(readInvocationLog()).toBe('');
  });

  it('runs the canonical package guard from the edited file worktree', () => {
    const result = runHook(
      'apps/server/api/src/collections/posts/posts.service.ts',
    );

    expect(result.status).toBe(0);
    expect(readInvocationLog()).toBe('run check:tenant-scope\n');
  });

  it('turns a canonical guard failure into actionable PostToolUse feedback', () => {
    const result = runHook(
      'apps/server/api/src/collections/posts/posts.service.ts',
      {
        bunExitCode: '1',
        bunStderr:
          'apps/server/api/src/posts.service.ts:9 [missing-is-deleted]\n',
        bunStdout: 'check:tenant-scope — new tenant-scope finding(s)\n',
      },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'BLOCKED by .claude/hooks/check-tenant-scope.py',
    );
    expect(result.stderr).toContain(
      'check:tenant-scope — new tenant-scope finding(s)',
    );
    expect(result.stderr).toContain('[missing-is-deleted]');
  });

  it('fails open for malformed hook payloads', () => {
    const result = spawnSync(PYTHON_PATH, [HOOK_PATH], {
      cwd: testDir,
      encoding: 'utf8',
      env: hookEnvironment(),
      input: 'not-json',
    });

    expect(result.status).toBe(0);
    expect(readInvocationLog()).toBe('');
  });

  it('fails open when bun is unavailable', () => {
    const noBunBin = path.join(testDir, 'no-bun-bin');
    mkdirSync(noBunBin, { recursive: true });
    symlinkSync(GIT_PATH, path.join(noBunBin, 'git'));

    const result = runHook(
      'apps/server/api/src/collections/posts/posts.service.ts',
      {
        pathValue: noBunBin,
      },
    );

    expect(result.status).toBe(0);
    expect(readInvocationLog()).toBe('');
  });

  it('wires only the canonical hook in Claude settings', () => {
    const settings = readFileSync(
      path.join(REPOSITORY_ROOT, '.claude/settings.json'),
      'utf8',
    );

    expect(settings).toContain('.claude/hooks/check-tenant-scope.py');
    expect(settings).not.toContain('check-multi-tenancy.py');
    expect(
      existsSync(
        path.join(REPOSITORY_ROOT, '.claude/hooks/check-multi-tenancy.py'),
      ),
    ).toBe(false);
  });

  function runHook(
    relativePath: string,
    options: {
      bunExitCode?: string;
      bunStderr?: string;
      bunStdout?: string;
      pathValue?: string;
    } = {},
  ): SpawnSyncReturns<string> {
    const filePath = writeFixture(relativePath, 'export {};\n');

    return spawnSync(PYTHON_PATH, [HOOK_PATH], {
      cwd: testDir,
      encoding: 'utf8',
      env: hookEnvironment(options),
      input: JSON.stringify({
        tool_input: {
          file_path: filePath,
        },
        tool_name: 'Edit',
      }),
    });
  }

  function hookEnvironment(
    options: {
      bunExitCode?: string;
      bunStderr?: string;
      bunStdout?: string;
      pathValue?: string;
    } = {},
  ): NodeJS.ProcessEnv {
    return {
      ...process.env,
      CLAUDE_PROJECT_DIR: testDir,
      HOOK_TEST_EXIT_CODE: options.bunExitCode ?? '0',
      HOOK_TEST_LOG: invocationLog,
      HOOK_TEST_STDERR: options.bunStderr ?? '',
      HOOK_TEST_STDOUT: options.bunStdout ?? '',
      PATH:
        options.pathValue ??
        `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
  }

  function readInvocationLog(): string {
    return existsSync(invocationLog) ? readFileSync(invocationLog, 'utf8') : '';
  }

  function writeFixture(relativePath: string, content: string): string {
    const filePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
    return filePath;
  }
});

function executablePath(command: string): string {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  const executable = result.stdout.trim();

  if (result.status !== 0 || !executable) {
    throw new Error(`${command} is required for tenant-scope hook fixtures.`);
  }

  return executable;
}

function writeFakeBun(fakeBinDir: string): void {
  const fakeBunPath = path.join(fakeBinDir, 'bun');
  writeFileSync(
    fakeBunPath,
    `#!/usr/bin/env python3
import os
import sys
from pathlib import Path

Path(os.environ["HOOK_TEST_LOG"]).write_text(
    " ".join(sys.argv[1:]) + "\\n",
    encoding="utf-8",
)
sys.stdout.write(os.environ.get("HOOK_TEST_STDOUT", ""))
sys.stderr.write(os.environ.get("HOOK_TEST_STDERR", ""))
raise SystemExit(int(os.environ.get("HOOK_TEST_EXIT_CODE", "0")))
`,
    'utf8',
  );
  chmodSync(fakeBunPath, 0o755);
}
