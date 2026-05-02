import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalService } from './terminal.service';

const { mockPty, spawnMock } = vi.hoisted(() => {
  const pty = {
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    pid: 1234,
    resize: vi.fn(),
    write: vi.fn(),
  };

  return {
    mockPty: pty,
    spawnMock: vi.fn(() => pty),
  };
});

vi.mock('node-pty', () => ({
  spawn: spawnMock,
}));

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  };
}

describe('TerminalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spawnMock.mockImplementation(() => mockPty);
    delete process.env.GENFEED_CLOUD;
    delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
    process.env.NODE_ENV = 'development';
  });

  it('is available during local development outside hosted cloud', () => {
    const service = new TerminalService(
      createConfigService({
        NODE_ENV: 'development',
      }) as never,
    );

    expect(service.isAvailable()).toBe(true);
  });

  it('is disabled on hosted cloud even in development', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    const service = new TerminalService(
      createConfigService({
        GENFEED_LOCAL_TERMINAL: 'true',
        NODE_ENV: 'development',
      }) as never,
    );

    expect(service.isAvailable()).toBe(false);
  });

  it('is disabled when the server cloud flag is enabled', () => {
    process.env.GENFEED_CLOUD = 'true';
    const service = new TerminalService(
      createConfigService({
        GENFEED_LOCAL_TERMINAL: 'true',
        NODE_ENV: 'development',
      }) as never,
    );

    expect(service.isAvailable()).toBe(false);
  });

  it('requires explicit enablement in self-hosted production', () => {
    process.env.NODE_ENV = 'production';
    const disabled = new TerminalService(
      createConfigService({
        NODE_ENV: 'production',
      }) as never,
    );
    const enabled = new TerminalService(
      createConfigService({
        GENFEED_LOCAL_TERMINAL: 'true',
        NODE_ENV: 'production',
      }) as never,
    );

    expect(disabled.isAvailable()).toBe(false);
    expect(enabled.isAvailable()).toBe(true);
  });

  it('documents the accepted production enablement value in disabled errors', () => {
    process.env.NODE_ENV = 'production';
    const service = new TerminalService(
      createConfigService({
        GENFEED_LOCAL_TERMINAL: '1',
        NODE_ENV: 'production',
      }) as never,
    );

    expect(() =>
      service.createSession('socket-1', undefined, {
        onData: vi.fn(),
        onExit: vi.fn(),
      }),
    ).toThrow('GENFEED_LOCAL_TERMINAL=true');
  });

  it('spawns allowlisted terminal commands in the configured cwd', () => {
    const workspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-terminal-'),
    );
    const service = new TerminalService(
      createConfigService({
        GENFEED_TERMINAL_CWD: workspaceDir,
        NODE_ENV: 'development',
      }) as never,
    );

    try {
      const session = service.createSession(
        'socket-1',
        { cols: 500, kind: 'codex', rows: 500 },
        {
          onData: vi.fn(),
          onExit: vi.fn(),
        },
      );

      expect(session).toMatchObject({
        command: 'codex',
        cwd: workspaceDir,
        kind: 'codex',
        pid: 1234,
      });
      expect(spawnMock).toHaveBeenCalledWith(
        'codex',
        [],
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
    const service = new TerminalService(
      createConfigService({
        GENFEED_TERMINAL_CWD: os.homedir(),
        NODE_ENV: 'development',
      }) as never,
    );

    try {
      const session = service.createSession(
        'socket-1',
        { cwd: workspaceDir, kind: 'shell' },
        {
          onData: vi.fn(),
          onExit: vi.fn(),
        },
      );

      expect(session.cwd).toBe(workspaceDir);
      expect(spawnMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      fs.rmSync(workspaceDir, { force: true, recursive: true });
    }
  });

  it('falls back to the home directory for invalid cwd requests', () => {
    const service = new TerminalService(
      createConfigService({
        NODE_ENV: 'development',
      }) as never,
    );

    const session = service.createSession(
      'socket-1',
      { cwd: '/tmp/does-not-exist-genfeed-terminal', kind: 'shell' },
      {
        onData: vi.fn(),
        onExit: vi.fn(),
      },
    );

    expect(session.cwd).toBe(os.homedir());
    expect(spawnMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        cwd: os.homedir(),
      }),
    );
  });

  it('returns a useful error when a requested CLI is missing', () => {
    const enoent = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
    enoent.code = 'ENOENT';
    spawnMock.mockImplementationOnce(() => {
      throw enoent;
    });
    const service = new TerminalService(
      createConfigService({
        NODE_ENV: 'development',
      }) as never,
    );

    expect(() =>
      service.createSession(
        'socket-1',
        { kind: 'codex' },
        {
          onData: vi.fn(),
          onExit: vi.fn(),
        },
      ),
    ).toThrow('Codex CLI (`codex`) is not installed or not on PATH');
  });

  it('only lets the owning socket write to a session', () => {
    const service = new TerminalService(
      createConfigService({
        NODE_ENV: 'development',
      }) as never,
    );
    const session = service.createSession('socket-1', undefined, {
      onData: vi.fn(),
      onExit: vi.fn(),
    });

    service.writeSession('other-socket', session.id, 'nope');
    service.writeSession('socket-1', session.id, 'echo ok\r');

    expect(mockPty.write).toHaveBeenCalledTimes(1);
    expect(mockPty.write).toHaveBeenCalledWith('echo ok\r');
  });
});
