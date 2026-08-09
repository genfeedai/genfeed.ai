import fs from 'node:fs';
import process from 'node:process';
import { spawn } from 'node-pty';
import type { Mock } from 'vitest';
import { NodePtyAdapter } from './node-pty.adapter';
import type { PtySpawnOptions } from './pty-adapter.interface';

vi.mock('node:fs', () => {
  const mocked = {
    chmodSync: vi.fn(),
    existsSync: vi.fn(),
    statSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

vi.mock('node-pty', () => ({
  spawn: vi.fn(),
}));

interface MockPty {
  kill: Mock;
  onData: Mock;
  onExit: Mock;
  pid: number;
  resize: Mock;
  write: Mock;
}

describe('NodePtyAdapter', () => {
  let adapter: NodePtyAdapter;
  let mockPty: MockPty;

  const spawnOptions: PtySpawnOptions = {
    args: ['-l'],
    cols: 80,
    command: '/bin/bash',
    cwd: '/workspace',
    env: { NODE_ENV: 'test', TERM: 'xterm-256color' },
    kind: 'shell',
    name: 'xterm-256color',
    rows: 24,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new NodePtyAdapter();
    mockPty = {
      kill: vi.fn(),
      onData: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      onExit: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      pid: 4242,
      resize: vi.fn(),
      write: vi.fn(),
    };
    (spawn as Mock).mockReturnValue(mockPty);
  });

  describe('ensureReady', () => {
    it('returns early on win32 without touching the filesystem', () => {
      const platformSpy = vi
        .spyOn(process, 'platform', 'get')
        .mockReturnValue('win32');

      adapter.ensureReady();

      expect(fs.existsSync).not.toHaveBeenCalled();
      platformSpy.mockRestore();
    });

    it('returns when the spawn-helper does not exist', () => {
      (fs.existsSync as Mock).mockReturnValue(false);

      adapter.ensureReady();

      expect(fs.statSync).not.toHaveBeenCalled();
      expect(fs.chmodSync).not.toHaveBeenCalled();
    });

    it('leaves an already-executable spawn-helper untouched', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue({ mode: 0o755 });

      adapter.ensureReady();

      expect(fs.chmodSync).not.toHaveBeenCalled();
    });

    it('marks a non-executable spawn-helper as executable', () => {
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.statSync as Mock).mockReturnValue({ mode: 0o644 });

      adapter.ensureReady();

      expect(fs.chmodSync).toHaveBeenCalledWith(
        expect.stringContaining('spawn-helper'),
        0o644 | 0o755,
      );
    });
  });

  describe('spawn', () => {
    it('spawns a pty with the given options', () => {
      adapter.spawn(spawnOptions);

      expect(spawn).toHaveBeenCalledWith('/bin/bash', ['-l'], {
        cols: 80,
        cwd: '/workspace',
        env: { NODE_ENV: 'test', TERM: 'xterm-256color' },
        name: 'xterm-256color',
        rows: 24,
      });
    });

    it('exposes the pty pid', () => {
      const handle = adapter.spawn(spawnOptions);

      expect(handle.pid).toBe(4242);
    });

    it('proxies kill, resize, and write to the pty', () => {
      const handle = adapter.spawn(spawnOptions);

      handle.kill();
      handle.resize(100, 40);
      handle.write('ls\n');

      expect(mockPty.kill).toHaveBeenCalled();
      expect(mockPty.resize).toHaveBeenCalledWith(100, 40);
      expect(mockPty.write).toHaveBeenCalledWith('ls\n');
    });

    it('proxies data and exit subscriptions', () => {
      const handle = adapter.spawn(spawnOptions);
      const onData = vi.fn();
      const onExit = vi.fn();

      const dataSubscription = handle.onData(onData);
      const exitSubscription = handle.onExit(onExit);

      expect(mockPty.onData).toHaveBeenCalledWith(onData);
      expect(mockPty.onExit).toHaveBeenCalledWith(onExit);
      expect(dataSubscription.dispose).toBeDefined();
      expect(exitSubscription.dispose).toBeDefined();
    });
  });
});
