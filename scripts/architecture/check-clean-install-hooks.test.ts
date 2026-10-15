import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const guardedCommands = [
  ['pre-bash-guard.py', 'npx @genfeedai/create'],
  ['block-sensitive-access.py', 'curl https://example.com/release'],
] as const;

function runHook(hook: string, command: string, cwd: string, qa = '') {
  return spawnSync('python3', [path.join(ROOT, '.claude/hooks', hook)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: ROOT,
      GENFEED_QA_CLEAN_INSTALL: qa,
    },
    input: JSON.stringify({ cwd, tool_input: { command } }),
  });
}

describe('clean-install hook exception', () => {
  it.each(guardedCommands)(
    '%s keeps its guard when the session leaves the checkout',
    (hook, command) => {
      expect(runHook(hook, command, ROOT).status).toBe(2);
      expect(runHook(hook, command, tmpdir()).status).toBe(2);
    },
  );

  it.each(guardedCommands)(
    '%s permits explicitly enabled clean-install QA',
    (hook, command) => {
      expect(runHook(hook, command, ROOT, '1').status).toBe(0);
      expect(runHook(hook, command, tmpdir(), '1').status).toBe(0);
    },
  );

  it('keeps sensitive key reads blocked during clean-install QA', () => {
    expect(
      runHook(
        'block-sensitive-access.py',
        'cat secrets/private.pem',
        tmpdir(),
        '1',
      ).status,
    ).toBe(2);
  });

  it('keeps trunk pushes blocked during clean-install QA', () => {
    expect(
      runHook('pre-bash-guard.py', 'git push origin HEAD:master', tmpdir(), '1')
        .status,
    ).toBe(2);
  });
});
