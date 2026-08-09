import type { TerminalSessionDto } from '@genfeedai/agent/stores/agent-chat.store';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import type { Socket } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachTerminalSocketHandlers,
  persistTerminalCwd,
  readPersistedTerminalCwd,
  resolveTerminalEndpoint,
  resolveThreadKey,
  TERMINAL_CWD_STORAGE_KEY,
} from './agent-cli-terminal.helpers';

describe('terminal cwd persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists and reads the terminal cwd', () => {
    persistTerminalCwd('/workspace/project');

    expect(window.localStorage.getItem(TERMINAL_CWD_STORAGE_KEY)).toBe(
      '/workspace/project',
    );
    expect(readPersistedTerminalCwd()).toBe('/workspace/project');
  });

  it('removes the stored cwd when persisting an empty value', () => {
    persistTerminalCwd('/workspace/project');
    persistTerminalCwd('');

    expect(window.localStorage.getItem(TERMINAL_CWD_STORAGE_KEY)).toBeNull();
    expect(readPersistedTerminalCwd()).toBe('');
  });

  it('resolveThreadKey falls back to global', () => {
    expect(resolveThreadKey('thread-1')).toBe('thread-1');
    expect(resolveThreadKey(null)).toBe('global');
  });

  it('resolveTerminalEndpoint strips a trailing slash', () => {
    expect(resolveTerminalEndpoint().endsWith('/')).toBe(false);
  });
});

type SocketHandler = (...args: never[]) => void;

function makeFakeSocket(): {
  socket: Socket;
  emit: (event: string, ...args: unknown[]) => void;
  handlers: Map<string, SocketHandler[]>;
} {
  const handlers = new Map<string, SocketHandler[]>();
  const socket = {
    off: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((item) => item !== handler),
      );
    }),
    on: vi.fn((event: string, handler: SocketHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
  } as unknown as Socket;

  return {
    emit: (event, ...args) => {
      for (const handler of handlers.get(event) ?? []) {
        (handler as (...eventArgs: unknown[]) => void)(...args);
      }
    },
    handlers,
    socket,
  };
}

function makeFakeTerminal() {
  return {
    clear: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
  } as unknown as XtermTerminal;
}

function makeSession(id: string): TerminalSessionDto {
  return {
    createdAt: '2026-03-26T10:00:00.000Z',
    cwd: '/workspace',
    id,
    kind: 'shell',
  };
}

describe('attachTerminalSocketHandlers', () => {
  function setup() {
    const { emit, handlers, socket } = makeFakeSocket();
    const terminal = makeFakeTerminal();
    const fitAndSyncSize = vi.fn();
    const onSessionCreated = vi.fn();
    const onSessionsListed = vi.fn();
    const onSessionAttached = vi.fn();
    const setStatus = vi.fn();
    const sessionIdRef: { current: string | null } = { current: null };

    const detach = attachTerminalSocketHandlers({
      fitAndSyncSize,
      onSessionAttached,
      onSessionCreated,
      onSessionsListed,
      sessionIdRef,
      setStatus,
      socket,
      terminal,
    });

    return {
      detach,
      emit,
      fitAndSyncSize,
      handlers,
      onSessionAttached,
      onSessionCreated,
      onSessionsListed,
      sessionIdRef,
      setStatus,
      socket,
      terminal,
    };
  }

  it('reports connect errors on the terminal', () => {
    const ctx = setup();

    ctx.emit('connect_error', new Error('gateway down'));

    expect(ctx.setStatus).toHaveBeenCalledWith('local terminal unavailable');
    expect(ctx.terminal.writeln).toHaveBeenCalledWith(
      expect.stringContaining('gateway down'),
    );
  });

  it('tracks created sessions and focuses the terminal', () => {
    const ctx = setup();
    const session = makeSession('sess-1');

    ctx.emit('terminal:created', session);

    expect(ctx.sessionIdRef.current).toBe('sess-1');
    expect(ctx.setStatus).toHaveBeenCalledWith('shell - /workspace');
    expect(ctx.onSessionCreated).toHaveBeenCalledWith(session);
    expect(ctx.fitAndSyncSize).toHaveBeenCalled();
    expect(ctx.terminal.focus).toHaveBeenCalled();
  });

  it('forwards listed sessions', () => {
    const ctx = setup();
    const sessions = [makeSession('sess-1'), makeSession('sess-2')];

    ctx.emit('terminal:sessions', sessions);

    expect(ctx.onSessionsListed).toHaveBeenCalledWith(sessions);
  });

  it('clears the terminal when attaching to an existing session', () => {
    const ctx = setup();
    const session = makeSession('sess-2');

    ctx.emit('terminal:attached', session);

    expect(ctx.sessionIdRef.current).toBe('sess-2');
    expect(ctx.terminal.clear).toHaveBeenCalled();
    expect(ctx.onSessionAttached).toHaveBeenCalledWith(session);
  });

  it('writes data only for the active session', () => {
    const ctx = setup();
    ctx.emit('terminal:created', makeSession('sess-1'));

    ctx.emit('terminal:data', { data: 'other', sessionId: 'sess-9' });
    ctx.emit('terminal:data', { data: 'hello', sessionId: 'sess-1' });

    expect(ctx.terminal.write).toHaveBeenCalledTimes(1);
    expect(ctx.terminal.write).toHaveBeenCalledWith('hello');
  });

  it('renders terminal errors with a fallback message', () => {
    const ctx = setup();

    ctx.emit('terminal:error', {});

    expect(ctx.setStatus).toHaveBeenCalledWith('Local terminal error.');
    expect(ctx.terminal.writeln).toHaveBeenCalledWith('Local terminal error.');
  });

  it('handles exit events for the active session only', () => {
    const ctx = setup();
    ctx.emit('terminal:created', makeSession('sess-1'));

    ctx.emit('terminal:exit', { sessionId: 'sess-9' });
    expect(ctx.sessionIdRef.current).toBe('sess-1');

    ctx.emit('terminal:exit', { exitCode: 130, sessionId: 'sess-1' });
    expect(ctx.setStatus).toHaveBeenCalledWith('exited with code 130');
    expect(ctx.sessionIdRef.current).toBeNull();
  });

  it('defaults the exit code to zero', () => {
    const ctx = setup();
    ctx.emit('terminal:created', makeSession('sess-1'));

    ctx.emit('terminal:exit', { sessionId: 'sess-1' });

    expect(ctx.setStatus).toHaveBeenCalledWith('exited with code 0');
  });

  it('detach removes every handler', () => {
    const ctx = setup();

    ctx.detach();

    for (const eventHandlers of ctx.handlers.values()) {
      expect(eventHandlers).toHaveLength(0);
    }
  });
});
