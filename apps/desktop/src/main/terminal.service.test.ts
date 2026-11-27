import { beforeEach, describe, expect, it, mock } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IDesktopTerminalDataEvent } from '@genfeedai/contracts/desktop';

const ptyState = {
  dataHandler: null as ((data: string) => void) | null,
  exitHandler: null as
    | ((event: { exitCode: number; signal?: number }) => void)
    | null,
  killed: false,
  resized: null as { cols: number; rows: number } | null,
  spawnCalls: [] as Array<{
    args: string[];
    command: string;
    options: {
      cols: number;
      cwd: string;
      env: NodeJS.ProcessEnv;
      rows: number;
    };
  }>,
  subscriptionsDisposed: 0,
  writes: [] as string[],
};

mock.module('node-pty', () => ({
  spawn: (
    command: string,
    args: string[],
    options: {
      cols: number;
      cwd: string;
      env: NodeJS.ProcessEnv;
      rows: number;
    },
  ) => {
    ptyState.spawnCalls.push({ args, command, options });

    return {
      kill: () => {
        ptyState.killed = true;
      },
      onData: (handler: (data: string) => void) => {
        ptyState.dataHandler = handler;
        return {
          dispose: () => {
            ptyState.subscriptionsDisposed += 1;
          },
        };
      },
      onExit: (
        handler: (event: { exitCode: number; signal?: number }) => void,
      ) => {
        ptyState.exitHandler = handler;
        return {
          dispose: () => {
            ptyState.subscriptionsDisposed += 1;
          },
        };
      },
      pid: 42,
      resize: (cols: number, rows: number) => {
        ptyState.resized = { cols, rows };
      },
      write: (data: string) => {
        ptyState.writes.push(data);
      },
    };
  },
}));

const { DesktopTerminalService } = await import('./terminal.service');

describe('DesktopTerminalService', () => {
  beforeEach(() => {
    ptyState.dataHandler = null;
    ptyState.exitHandler = null;
    ptyState.killed = false;
    ptyState.resized = null;
    ptyState.spawnCalls = [];
    ptyState.subscriptionsDisposed = 0;
    ptyState.writes = [];
  });

  it('starts a PTY in the requested directory and forwards data events', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-terminal-'));
    const dataEvents: IDesktopTerminalDataEvent[] = [];
    const service = new DesktopTerminalService();

    const session = await service.createSession(
      {
        cols: 140,
        cwd,
        rows: 40,
      },
      (event) => dataEvents.push(event),
      () => {},
    );

    expect(session.cwd).toBe(cwd);
    expect(session.kind).toBe('shell');
    expect(session.pid).toBe(42);
    expect(ptyState.spawnCalls[0]?.options).toMatchObject({
      cols: 140,
      cwd,
      rows: 40,
    });
    expect(ptyState.spawnCalls[0]?.options.env.PATH).toContain(
      '/opt/homebrew/bin',
    );

    ptyState.dataHandler?.('ls\r\n');

    expect(dataEvents).toEqual([{ data: 'ls\r\n', sessionId: session.id }]);
  });

  it('writes, resizes, and kills only active sessions', async () => {
    const service = new DesktopTerminalService();
    const session = await service.createSession(
      { kind: 'codex' },
      () => {},
      () => {},
    );

    expect(ptyState.spawnCalls[0]?.command).toBe('codex');
    expect(ptyState.spawnCalls[0]?.options.cwd).toBeTruthy();

    service.writeSession(session.id, 'pwd\n');
    service.resizeSession(session.id, 100, 24);
    service.writeSession('missing-session', 'ignored');
    service.killSession(session.id);
    service.killSession(session.id);

    expect(ptyState.writes).toEqual(['pwd\n']);
    expect(ptyState.resized).toEqual({ cols: 100, rows: 24 });
    expect(ptyState.killed).toBe(true);
    expect(ptyState.subscriptionsDisposed).toBe(2);
  });

  it('starts the Genfeed CLI through a wrapper that explains a missing gf', async () => {
    const service = new DesktopTerminalService();

    await service.createSession(
      { kind: 'genfeed' },
      () => {},
      () => {},
    );

    const call = ptyState.spawnCalls[0];
    expect(call?.command).not.toBe('gf');
    expect(call?.args.join(' ')).toContain('npm install -g @genfeedai/cli');
  });

  it('gives only a Genfeed CLI session the Desktop sign-in', async () => {
    const service = new DesktopTerminalService(() => ({
      GENFEED_API_KEY: 'gf_desktop',
      GENFEED_API_URL: 'https://api.example.com/v1',
    }));

    for (const kind of ['genfeed', 'shell', 'claude', 'codex'] as const) {
      await service.createSession(
        { kind },
        () => {},
        () => {},
      );
    }

    const signedIn = ptyState.spawnCalls.map((call) => ({
      key: call.options.env.GENFEED_API_KEY,
      url: call.options.env.GENFEED_API_URL,
    }));
    expect(signedIn).toEqual([
      { key: 'gf_desktop', url: 'https://api.example.com/v1' },
      { key: undefined, url: undefined },
      { key: undefined, url: undefined },
      { key: undefined, url: undefined },
    ]);
  });

  it('starts a Genfeed CLI session without sign-in when Desktop has no session', async () => {
    const service = new DesktopTerminalService(() => null);

    await service.createSession(
      { kind: 'genfeed' },
      () => {},
      () => {},
    );

    expect(ptyState.spawnCalls[0]?.options.env.GENFEED_API_KEY).toBeUndefined();
  });

  it('removes exited sessions before later writes', async () => {
    const exitEvents: Array<{ exitCode?: number; sessionId: string }> = [];
    const service = new DesktopTerminalService();
    const session = await service.createSession(
      undefined,
      () => {},
      (event) => exitEvents.push(event),
    );

    ptyState.exitHandler?.({ exitCode: 0 });
    service.writeSession(session.id, 'ignored');

    expect(exitEvents).toEqual([{ exitCode: 0, sessionId: session.id }]);
    expect(ptyState.subscriptionsDisposed).toBe(2);
    expect(ptyState.writes).toEqual([]);
  });

  it('honors an existing cwd for an agent CLI session', async () => {
    const service = new DesktopTerminalService();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-terminal-'));

    const session = await service.createSession(
      { cwd, kind: 'claude' },
      () => {},
      () => {},
    );

    expect(session.cwd).toBe(cwd);
    expect(ptyState.spawnCalls[0]?.command).toBe('claude');
  });

  it('opens a claude session on its prompt as one argument and adds no permission flag', async () => {
    const service = new DesktopTerminalService();

    await service.createSession(
      { kind: 'claude', prompt: 'Use the threejs-previs skill; rm -rf ~' },
      () => {},
      () => {},
    );

    expect(ptyState.spawnCalls[0]?.command).toBe('claude');
    expect(ptyState.spawnCalls[0]?.args).toEqual([
      'Use the threejs-previs skill; rm -rf ~',
    ]);
  });

  it('ignores a prompt for every kind but claude', async () => {
    const service = new DesktopTerminalService();

    await service.createSession(
      { kind: 'codex', prompt: 'ignored' },
      () => {},
      () => {},
    );

    expect(ptyState.spawnCalls[0]?.args).toEqual([]);
  });

  it('falls back to the home directory for relative or missing cwd values', async () => {
    const service = new DesktopTerminalService();

    const relative = await service.createSession(
      { cwd: '../etc' },
      () => {},
      () => {},
    );
    const missing = await service.createSession(
      { cwd: '/definitely/not/a/genfeed/dir' },
      () => {},
      () => {},
    );

    expect(relative.cwd).toBe(os.homedir());
    expect(missing.cwd).toBe(os.homedir());
  });
});
