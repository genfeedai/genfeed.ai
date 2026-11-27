import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  GENFEED_CLI_INSTALL_COMMAND,
  resolveGenfeedCliLaunch,
} from './genfeed-cli-launch.util';

const posixIt = process.platform === 'win32' ? it.skip : it;

describe('resolveGenfeedCliLaunch', () => {
  let root = '';

  const writeExecutable = (name: string, body: string): void => {
    const file = path.join(root, name);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };

  const run = (
    extraEnv: Record<string, string> = {},
  ): { output: string; status: number | null } => {
    const { args, command } = resolveGenfeedCliLaunch('darwin');
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      env: {
        PATH: `${root}:/usr/bin:/bin`,
        SHELL: path.join(root, 'fake-shell'),
        ...extraEnv,
      },
    });

    return { output: result.stdout + result.stderr, status: result.status };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-cli-launch-'));
    writeExecutable('fake-shell', 'echo "user shell $*"');
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
  });

  posixIt(
    'prints the install command and opens a shell when gf is missing',
    () => {
      const { output } = run();

      expect(output).toContain('is not installed');
      expect(output).toContain(GENFEED_CLI_INSTALL_COMMAND);
      expect(output).toContain('user shell -l');
    },
  );

  posixIt(
    'does not hand the Desktop sign-in to the shell it opens when gf is missing',
    () => {
      writeExecutable(
        'fake-shell',
        'echo "key=[${GENFEED_API_KEY:-}] url=[${GENFEED_API_URL:-}]"',
      );

      const { output } = run({
        GENFEED_API_KEY: 'gf_secret',
        GENFEED_API_URL: 'https://api.genfeed.ai/v1',
      });

      expect(output).toContain('key=[] url=[]');
    },
  );

  posixIt('lets gf use the Desktop sign-in it was started with', () => {
    writeExecutable(
      'gf',
      'if [ "$1" = auth ]; then [ "$GENFEED_API_KEY" = gf_secret ] && echo "Logged in: yes"; else echo "gf started"; fi',
    );

    const { output } = run({ GENFEED_API_KEY: 'gf_secret' });

    expect(output).toContain('Genfeed CLI: signed in.');
  });

  posixIt('reports a signed-in CLI and then starts it', () => {
    writeExecutable(
      'gf',
      'if [ "$1" = auth ]; then echo "Logged in: yes"; else echo "gf started"; fi',
    );

    const { output } = run();

    expect(output).toContain('signed in.');
    expect(output).not.toContain('not signed in');
    expect(output).toContain('gf started');
  });

  posixIt(
    'tells a signed-out user how to sign in and still starts the CLI',
    () => {
      writeExecutable(
        'gf',
        'if [ "$1" = auth ]; then echo "Logged in: no"; else echo "gf started"; fi',
      );

      const { output } = run();

      expect(output).toContain('not signed in. Run: gf auth login');
      expect(output).toContain('gf started');
    },
  );

  it('uses PowerShell on Windows', () => {
    const { args, command } = resolveGenfeedCliLaunch('win32');

    expect(command).toBe('powershell.exe');
    expect(args.join(' ')).toContain(GENFEED_CLI_INSTALL_COMMAND);
  });
});
