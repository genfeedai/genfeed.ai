import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalView } from './TerminalView';

const terminalMockState = vi.hoisted(() => ({
  onData: null as ((data: string) => void) | null,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn();
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 120;
    rows = 32;
    dispose = vi.fn();
    focus = vi.fn();
    loadAddon = vi.fn();
    reset = vi.fn();
    write = vi.fn();
    writeln = vi.fn();

    onData(callback: (data: string) => void) {
      terminalMockState.onData = callback;
      return { dispose: vi.fn() };
    }

    open(container: HTMLElement) {
      const terminalElement = document.createElement('div');
      terminalElement.className = 'xterm';
      container.appendChild(terminalElement);
    }
  },
}));

const terminalApi = {
  create: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
  resize: vi.fn(),
  write: vi.fn(),
};

describe('TerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalMockState.onData = null;

    global.ResizeObserver = class ResizeObserver {
      disconnect() {
        /* noop */
      }
      observe() {
        /* noop */
      }
      unobserve() {
        /* noop */
      }
    } as unknown as typeof globalThis.ResizeObserver;

    terminalApi.create.mockResolvedValue({
      command: '/bin/zsh',
      createdAt: '2026-05-01T00:00:00.000Z',
      cwd: '/tmp/genfeed',
      id: 'terminal-session-1',
      kind: 'shell',
      pid: 123,
    });
    terminalApi.kill.mockResolvedValue(undefined);
    terminalApi.onData.mockReturnValue(vi.fn());
    terminalApi.onExit.mockReturnValue(vi.fn());
    terminalApi.resize.mockResolvedValue(undefined);
    terminalApi.write.mockResolvedValue(undefined);

    Object.defineProperty(window, 'genfeedDesktop', {
      configurable: true,
      value: {
        terminal: terminalApi,
      },
    });
  });

  it('renders an xterm terminal instead of a React pre buffer', async () => {
    const { container } = render(<TerminalView workspaceId="workspace_123" />);

    await waitFor(() => {
      expect(terminalApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'shell',
          workspaceId: 'workspace_123',
        }),
      );
    });

    expect(container.querySelector('pre')).not.toBeInTheDocument();
    expect(container.querySelector('.xterm')).toBeInTheDocument();
  });

  it('streams keyboard input to the active PTY session', async () => {
    render(<TerminalView workspaceId={null} />);

    await waitFor(() => {
      expect(screen.getByText('/bin/zsh - /tmp/genfeed')).toBeInTheDocument();
      expect(terminalMockState.onData).toBeInstanceOf(Function);
    });

    terminalMockState.onData?.('ls\n');

    expect(terminalApi.write).toHaveBeenCalledWith(
      'terminal-session-1',
      'ls\n',
    );
  });

  it('switches terminal presets without keeping the previous session alive', async () => {
    render(<TerminalView workspaceId={null} />);

    await waitFor(() => {
      expect(screen.getByText('/bin/zsh - /tmp/genfeed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Codex' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Codex' }));

    await waitFor(() => {
      expect(terminalApi.kill).toHaveBeenCalledWith('terminal-session-1');
      expect(terminalApi.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'codex',
        }),
      );
    });
  });
});
