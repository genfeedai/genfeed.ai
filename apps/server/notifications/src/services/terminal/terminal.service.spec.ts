import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPtyAdapter, IPtyHandle } from './pty/pty-adapter.interface';
import { PTY_ADAPTER } from './pty/pty-adapter.interface';
import { TerminalService } from './terminal.service';

function createMockPty(): IPtyHandle {
  return {
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    pid: 1234,
    resize: vi.fn(),
    write: vi.fn(),
  };
}

function createMockAdapter(pty: IPtyHandle): IPtyAdapter {
  return {
    ensureReady: vi.fn(),
    spawn: vi.fn(() => pty),
  };
}

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  };
}

function createService(
  configValues: Record<string, string | undefined>,
  adapter: IPtyAdapter,
): TerminalService {
  return new TerminalService(
    createConfigService(configValues) as never,
    adapter,
  );
}

describe('TerminalService', () => {
  let mockPty: IPtyHandle;
  let mockAdapter: IPtyAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPty = createMockPty();
    mockAdapter = createMockAdapter(mockPty);
    delete process.env.GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    process.env.NODE_ENV = 'development';
  });

  it('is available during local development outside hosted cloud', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);

    expect(service.isAvailable()).toBe(true);
  });

  it('is disabled on hosted cloud even in development', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    const service = createService(
      { GENFEED_LOCAL_TERMINAL: 'true', NODE_ENV: 'development' },
      mockAdapter,
    );

    expect(service.isAvailable()).toBe(false);
  });

  it('is disabled when the server cloud flag is enabled', () => {
    process.env.GENFEED_CLOUD = 'true';
    const service = createService(
      { GENFEED_LOCAL_TERMINAL: 'true', NODE_ENV: 'development' },
      mockAdapter,
    );

    expect(service.isAvailable()).toBe(false);
  });

  it('requires explicit enablement in self-hosted production', () => {
    process.env.NODE_ENV = 'production';
    const disabled = createService({ NODE_ENV: 'production' }, mockAdapter);
    const enabled = createService(
      { GENFEED_LOCAL_TERMINAL: 'true', NODE_ENV: 'production' },
      mockAdapter,
    );

    expect(disabled.isAvailable()).toBe(false);
    expect(enabled.isAvailable()).toBe(true);
  });

  it('documents the accepted production enablement value in disabled errors', () => {
    process.env.NODE_ENV = 'production';
    const service = createService(
      { GENFEED_LOCAL_TERMINAL: '1', NODE_ENV: 'production' },
      mockAdapter,
    );

    expect(() =>
      service.createSession('socket-1', 'user_123', undefined, {
        onData: vi.fn(),
        onExit: vi.fn(),
      }),
    ).toThrow('GENFEED_LOCAL_TERMINAL=true');
  });

  it('spawns allowlisted terminal commands in the configured cwd', () => {
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-terminal-'),
    );
    const service = createService(
      { GENFEED_TERMINAL_CWD: workspaceDir, NODE_ENV: 'development' },
      mockAdapter,
    );

    try {
      const session = service.createSession(
        'socket-1',
        'user_123',
        { cols: 500, kind: 'codex', rows: 500 },
        { onData: vi.fn(), onExit: vi.fn() },
      );

      expect(session).toMatchObject({
        command: 'codex',
        cwd: workspaceDir,
        kind: 'codex',
        pid: 1234,
      });
      expect(mockAdapter.spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          cols: 240,
          cwd: workspaceDir,
          rows: 80,
        }),
      );
    } finally {
      fs.rmSync(workspaceDir, { force: true, recursive: true });
    }
  });

  it('lets the client request a validated workspace cwd', () => {
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-terminal-'),
    );
    const service = createService(
      { GENFEED_TERMINAL_CWD: os.homedir(), NODE_ENV: 'development' },
      mockAdapter,
    );

    try {
      const session = service.createSession(
        'socket-1',
        'user_123',
        { cwd: workspaceDir, kind: 'shell' },
        { onData: vi.fn(), onExit: vi.fn() },
      );

      expect(session.cwd).toBe(workspaceDir);
      expect(mockAdapter.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ cwd: workspaceDir }),
      );
    } finally {
      fs.rmSync(workspaceDir, { force: true, recursive: true });
    }
  });

  it('falls back to the home directory for invalid cwd requests', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);

    const session = service.createSession(
      'socket-1',
      'user_123',
      { cwd: '/tmp/does-not-exist-genfeed-terminal', kind: 'shell' },
      { onData: vi.fn(), onExit: vi.fn() },
    );

    expect(session.cwd).toBe(os.homedir());
    expect(mockAdapter.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: os.homedir() }),
    );
  });

  it('returns a useful error when a requested CLI is missing', () => {
    const enoent = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    vi.mocked(mockAdapter.spawn).mockImplementationOnce(() => {
      throw enoent;
    });
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);

    expect(() =>
      service.createSession(
        'socket-1',
        'user_123',
        { kind: 'codex' },
        { onData: vi.fn(), onExit: vi.fn() },
      ),
    ).toThrow('Codex CLI (`codex`) is not installed or not on PATH');
  });

  it('only lets the owning socket write to a session', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);
    const session = service.createSession('socket-1', 'user_123', undefined, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    service.writeSession('other-socket', 'user_123', session.id, 'nope');
    service.writeSession('socket-1', 'user_123', session.id, 'echo ok\r');

    expect(mockPty.write).toHaveBeenCalledTimes(1);
    expect(mockPty.write).toHaveBeenCalledWith('echo ok\r');
  });

  it('stores threadId on the session DTO', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);
    const session = service.createSession(
      'socket-1',
      'user_123',
      { kind: 'shell', threadId: 'thread-abc' },
      { onData: vi.fn(), onExit: vi.fn() },
    );

    expect(session.threadId).toBe('thread-abc');
  });

  it('lists sessions belonging to the owner user', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);

    const s1 = service.createSession('socket-1', 'user_123', undefined, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });
    // Create a second pty mock for the second session
    const pty2 = createMockPty();
    vi.mocked(mockAdapter.spawn).mockImplementationOnce(() => pty2);
    service.createSession('socket-1', 'user_456', undefined, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const sessions = service.listForOwner('user_123');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(s1.id);
  });

  it('flushes scrollback and rebinds live data on attach', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);
    const onDataOriginal = vi.fn();
    const session = service.createSession('socket-1', 'user_123', undefined, {
      onData: onDataOriginal,
      onExit: vi.fn(),
    });

    // Simulate pty output flowing into the buffer via the onData subscription
    const dataHandler = vi.mocked(mockPty.onData).mock.calls[0][0];
    dataHandler('hello from pty');

    const onDataNew = vi.fn();
    const dto = service.attach('socket-2', 'user_123', session.id, {
      onData: onDataNew,
      onExit: vi.fn(),
    });

    expect(dto).not.toBeNull();
    // Scrollback was flushed to the new socket
    expect(onDataNew).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.stringContaining('hello from pty'),
      }),
    );
  });

  it('denies attach from a different userId', () => {
    const service = createService({ NODE_ENV: 'development' }, mockAdapter);
    const session = service.createSession('socket-1', 'user_123', undefined, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    const result = service.attach('socket-2', 'user_999', session.id, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    expect(result).toBeNull();
  });
});
