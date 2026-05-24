import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { IDesktopTerminalDataEvent } from '@genfeedai/desktop-contracts';
import type { DesktopWorkspaceService } from './workspace.service';

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

  it('starts a PTY in the selected workspace and forwards data events', async () => {
    const workspaceService = {
      getWorkspace: async () => ({
        path: '/tmp/genfeed-workspace',
      }),
    } as unknown as DesktopWorkspaceService;
    const dataEvents: IDesktopTerminalDataEvent[] = [];
    const service = new DesktopTerminalService(workspaceService);

    const session = await service.createSession(
      {
        cols: 140,
        rows: 40,
        workspaceId: 'workspace-1',
      },
      (event) => dataEvents.push(event),
      () => {},
    );

    expect(session.cwd).toBe('/tmp/genfeed-workspace');
    expect(session.kind).toBe('shell');
    expect(session.pid).toBe(42);
    expect(ptyState.spawnCalls[0]?.options).toMatchObject({
      cols: 140,
      cwd: '/tmp/genfeed-workspace',
      rows: 40,
    });
    expect(ptyState.spawnCalls[0]?.options.env.PATH).toContain(
      '/opt/homebrew/bin',
    );

    ptyState.dataHandler?.('ls\r\n');

    expect(dataEvents).toEqual([{ data: 'ls\r\n', sessionId: session.id }]);
  });

  it('writes, resizes, and kills only active sessions', async () => {
    const workspaceService = {
      getWorkspace: async () => {
        throw new Error('workspace should not be resolved');
      },
    } as unknown as DesktopWorkspaceService;
    const service = new DesktopTerminalService(workspaceService);
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

  it('removes exited sessions before later writes', async () => {
    const workspaceService = {
      getWorkspace: async () => ({ path: '/tmp/genfeed-workspace' }),
    } as unknown as DesktopWorkspaceService;
    const exitEvents: Array<{ exitCode?: number; sessionId: string }> = [];
    const service = new DesktopTerminalService(workspaceService);
    const session = await service.createSession(
      { workspaceId: 'workspace-1' },
      () => {},
      (event) => exitEvents.push(event),
    );

    ptyState.exitHandler?.({ exitCode: 0 });
    service.writeSession(session.id, 'ignored');

    expect(exitEvents).toEqual([{ exitCode: 0, sessionId: session.id }]);
    expect(ptyState.subscriptionsDisposed).toBe(2);
    expect(ptyState.writes).toEqual([]);
  });
});
