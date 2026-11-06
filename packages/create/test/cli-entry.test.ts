import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// What the CLI did that a user could observe: the commands it launched and
// the lines it printed, in order.
const observed = vi.hoisted(() => ({
  commands: [] as string[],
  errors: [] as string[],
}));

const childProcessMock = vi.hoisted(() => ({
  spawn: (command: string) => {
    observed.commands.push(command);
    throw new Error(`unexpected spawn of ${command}`);
  },
  // Every probed binary (tar, docker, ...) is missing.
  spawnSync: (command: string) => {
    observed.commands.push(command);
    return { status: 1 };
  },
}));

const consolaMock = vi.hoisted(() => ({
  error: (message: string) => {
    observed.errors.push(message);
  },
  info: () => undefined,
  start: () => undefined,
  success: () => undefined,
  warn: () => undefined,
}));

vi.mock('node:child_process', () => childProcessMock);
vi.mock('consola', () => ({ consola: consolaMock }));

const entryPath = fileURLToPath(new URL('../src/index.ts', import.meta.url));

describe('CLI entry point', () => {
  let originalArgv: string[];
  let originalExitCode: typeof process.exitCode;
  const originalVersions = process.versions;

  function stubNodeVersion(version: string): void {
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: { ...originalVersions, node: version },
    });
  }

  beforeEach(() => {
    vi.resetModules();
    originalArgv = [...process.argv];
    originalExitCode = process.exitCode;
    observed.commands = [];
    observed.errors = [];
    stubNodeVersion('24.0.0');
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: originalVersions,
    });
  });

  it('runs main, reports the failure, and sets a non-zero exit code', async () => {
    process.argv = [process.argv[0], entryPath, 'demo-project'];

    await import('../src/index.js');

    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(observed.errors).toContain(
      'tar is required to extract the Genfeed.ai release bundle.',
    );
  });

  it('fails fast before installing when Node is outside the supported range', async () => {
    stubNodeVersion('20.19.0');
    process.argv = [process.argv[0], entryPath, 'demo-project'];

    await import('../src/index.js');

    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(observed.errors).toEqual([
      expect.stringContaining('Node.js 24 or newer is required'),
    ]);
    expect(observed.commands).toEqual([]);
  });

  it('stays inert when the process has no script argument', async () => {
    process.argv = [process.argv[0], ''];

    await import('../src/index.js');
    await new Promise((resolvePromise) => setImmediate(resolvePromise));

    expect(observed.errors).toEqual([]);
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('stays inert when the script argument cannot be resolved', async () => {
    process.argv = [process.argv[0], '/nonexistent/genfeed-cli-entry.js'];

    await import('../src/index.js');
    await new Promise((resolvePromise) => setImmediate(resolvePromise));

    expect(observed.errors).toEqual([]);
    expect(process.exitCode).toBe(originalExitCode);
  });
});
