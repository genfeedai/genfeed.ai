import { createDesktopTerminalTransport } from '@genfeedai/agent/components/agent-cli-terminal.desktop-transport';
import type {
  IDesktopTerminalDataEvent,
  IDesktopTerminalExitEvent,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type { Terminal as XtermTerminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

function setup() {
  let dataListener: ((event: IDesktopTerminalDataEvent) => void) | null = null;
  let exitListener: ((event: IDesktopTerminalExitEvent) => void) | null = null;
  const terminalBridge = {
    create: vi.fn().mockResolvedValue({
      command: 'claude',
      createdAt: '2026-09-25T00:00:00.000Z',
      cwd: '/Users/me',
      id: 'pty-1',
      kind: 'claude',
      pid: 42,
    }),
    kill: vi.fn().mockResolvedValue(undefined),
    onData: vi.fn((callback: (event: IDesktopTerminalDataEvent) => void) => {
      dataListener = callback;
      return () => {
        dataListener = null;
      };
    }),
    onExit: vi.fn((callback: (event: IDesktopTerminalExitEvent) => void) => {
      exitListener = callback;
      return () => {
        exitListener = null;
      };
    }),
    resize: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  };
  const terminal = {
    clear: vi.fn(),
    focus: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
  };
  const sessionIdRef = { current: null as string | null };
  const onSessionCreated = vi.fn();
  const setStatus = vi.fn();
  const { dispose, transport } = createDesktopTerminalTransport({
    bridge: { terminal: terminalBridge } as unknown as IGenfeedDesktopBridge,
    fitAndSyncSize: vi.fn(),
    onSessionAttached: vi.fn(),
    onSessionCreated,
    sessionIdRef,
    setStatus,
    terminal: terminal as unknown as XtermTerminal,
  });

  return {
    dispose,
    emitData: (event: IDesktopTerminalDataEvent) => dataListener?.(event),
    emitExit: (event: IDesktopTerminalExitEvent) => exitListener?.(event),
    hasListeners: () => dataListener !== null || exitListener !== null,
    onSessionCreated,
    sessionIdRef,
    setStatus,
    terminal,
    terminalBridge,
    transport,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createDesktopTerminalTransport', () => {
  it('creates PTYs through the bridge and streams their output', async () => {
    const context = setup();

    expect(context.transport.autoStartsSessions).toBe(false);
    context.transport.create({
      cols: 100,
      cwd: '~/work',
      kind: 'claude',
      rows: 30,
      threadId: 'thread-1',
    });
    await flush();

    expect(context.terminalBridge.create).toHaveBeenCalledWith({
      cols: 100,
      cwd: '~/work',
      kind: 'claude',
      rows: 30,
    });
    expect(context.onSessionCreated).toHaveBeenCalledWith({
      createdAt: '2026-09-25T00:00:00.000Z',
      cwd: '/Users/me',
      id: 'pty-1',
      kind: 'claude',
      threadId: 'thread-1',
    });
    expect(context.sessionIdRef.current).toBe('pty-1');

    context.emitData({ data: 'hello', sessionId: 'pty-1' });
    context.emitData({ data: 'ignored', sessionId: 'pty-other' });
    expect(context.terminal.write).toHaveBeenCalledTimes(1);
    expect(context.terminal.write).toHaveBeenCalledWith('hello');

    context.transport.write({ data: 'ls\r', sessionId: 'pty-1' });
    context.transport.resize({ cols: 80, rows: 24, sessionId: 'pty-1' });
    expect(context.terminalBridge.write).toHaveBeenCalledWith('pty-1', 'ls\r');
    expect(context.terminalBridge.resize).toHaveBeenCalledWith('pty-1', 80, 24);

    context.emitExit({ exitCode: 0, sessionId: 'pty-1' });
    expect(context.sessionIdRef.current).toBeNull();
    expect(context.setStatus).toHaveBeenLastCalledWith('exited with code 0');
  });

  it('shows why a terminal could not start (e.g. the user declined)', async () => {
    const context = setup();
    context.terminalBridge.create.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'desktop:terminal:create': Error: Terminal access was not allowed.",
      ),
    );

    context.transport.create({ kind: 'shell' });
    await flush();

    expect(context.setStatus).toHaveBeenLastCalledWith(
      'Terminal access was not allowed.',
    );
  });

  it('kills its PTYs and unsubscribes on dispose', async () => {
    const context = setup();
    context.transport.create({ kind: 'shell' });
    await flush();

    context.dispose();

    expect(context.terminalBridge.kill).toHaveBeenCalledWith('pty-1');
    expect(context.hasListeners()).toBe(false);
  });
});
