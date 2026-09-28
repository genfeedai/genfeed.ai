import { describe, expect, it } from 'bun:test';
import type { spawnSync } from 'node:child_process';
import {
  CODEX_UPGRADE_MESSAGE,
  detectDesktopLocalTools,
  isDesktopCodexAgentRuntimeSupported,
} from './local-tools.util';

function fakeSpawn(result: {
  error?: Error;
  status: number | null;
  stdout?: string;
}): { calls: string[][]; spawn: typeof spawnSync } {
  const calls: string[][] = [];
  const spawn = ((command: string, args: readonly string[]) => {
    calls.push([command, ...args]);
    return { ...result, stdout: result.stdout ?? '' };
  }) as unknown as typeof spawnSync;
  return { calls, spawn };
}

describe('detectDesktopLocalTools', () => {
  it('reports Claude, Codex, and Grok when those CLIs are on PATH', () => {
    const readiness = detectDesktopLocalTools(
      (command) => ['claude', 'codex', 'grok'].includes(command),
      () => true,
    );

    expect(readiness).toEqual({
      anyDetected: true,
      claude: true,
      codex: true,
      detected: ['claude', 'codex', 'grok'],
      grok: true,
      upgradesRequired: [],
    });
  });

  it('reports an empty local-tool set when no CLI is installed', () => {
    let isCodexProbed = false;
    const readiness = detectDesktopLocalTools(
      () => false,
      () => {
        isCodexProbed = true;
        return true;
      },
    );

    expect(readiness).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
      grok: false,
      upgradesRequired: [],
    });
    expect(isCodexProbed).toBe(false);
  });

  it('keeps a Codex CLI without the isolation flags not ready, with an upgrade step', () => {
    const readiness = detectDesktopLocalTools(
      (command) => command === 'codex',
      () => false,
    );

    expect(readiness).toEqual({
      anyDetected: false,
      claude: false,
      codex: false,
      detected: [],
      grok: false,
      upgradesRequired: [{ key: 'codex', message: CODEX_UPGRADE_MESSAGE }],
    });
    expect(CODEX_UPGRADE_MESSAGE).toContain(
      'npm install -g @openai/codex@latest',
    );
  });
});

describe('isDesktopCodexAgentRuntimeSupported', () => {
  it('accepts a Codex CLI whose exec help lists --ignore-user-config', () => {
    const { calls, spawn } = fakeSpawn({
      status: 0,
      stdout:
        '      --ignore-user-config\n          Do not load `$CODEX_HOME/config.toml`',
    });

    expect(isDesktopCodexAgentRuntimeSupported(spawn)).toBe(true);
    expect(calls).toEqual([['codex', 'exec', '--help']]);
  });

  it('rejects an older Codex CLI (0.114.0) that lacks the flag', () => {
    const { spawn } = fakeSpawn({
      status: 0,
      stdout:
        'Run Codex non-interactively\n      --skip-git-repo-check\n      --json\n',
    });

    expect(isDesktopCodexAgentRuntimeSupported(spawn)).toBe(false);
  });

  it('rejects a Codex CLI whose help fails to run', () => {
    expect(
      isDesktopCodexAgentRuntimeSupported(fakeSpawn({ status: 2 }).spawn),
    ).toBe(false);
    expect(
      isDesktopCodexAgentRuntimeSupported(
        fakeSpawn({ error: new Error('ETIMEDOUT'), status: null }).spawn,
      ),
    ).toBe(false);
  });
});
