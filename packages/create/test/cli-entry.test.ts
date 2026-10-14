import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMock = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

const consolaMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  start: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
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
    childProcessMock.spawnSync.mockReturnValue({ status: 1 });
    stubNodeVersion('24.0.0');
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    Object.defineProperty(process, 'versions', {
      configurable: true,
      value: originalVersions,
    });
    vi.clearAllMocks();
  });

  it('runs main, reports the failure, and sets a non-zero exit code', async () => {
    process.argv = [process.argv[0], entryPath, 'demo-project'];

    await import('../src/index');

    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(consolaMock.error).toHaveBeenCalledWith(
      'tar is required to extract the Genfeed.ai release bundle.',
    );
  });

  it('fails fast before installing when Node is outside the supported range', async () => {
    stubNodeVersion('20.19.0');
    process.argv = [process.argv[0], entryPath, 'demo-project'];

    await import('../src/index');

    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(consolaMock.error).toHaveBeenCalledWith(
      expect.stringContaining('Node.js 24 is required'),
    );
    expect(childProcessMock.spawnSync).not.toHaveBeenCalled();
  });

  it('stays inert when the process has no script argument', async () => {
    process.argv = [process.argv[0], ''];

    await import('../src/index');
    await new Promise((resolvePromise) => setImmediate(resolvePromise));

    expect(consolaMock.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(originalExitCode);
  });

  it('stays inert when the script argument cannot be resolved', async () => {
    process.argv = [process.argv[0], '/nonexistent/genfeed-cli-entry.js'];

    await import('../src/index');
    await new Promise((resolvePromise) => setImmediate(resolvePromise));

    expect(consolaMock.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(originalExitCode);
  });
});
