import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  type TerminalSessionDto,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { ORGANIZATION_CONTEXT_HEADER } from '@genfeedai/contracts/constants';
import {
  clearRequestOrganizationId,
  setRequestOrganizationId,
} from '@genfeedai/services/core/interceptor.service';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketMocks = vi.hoisted(() => ({
  connected: true,
  disconnect: vi.fn(),
  emit: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
}));
const ioMock = vi.hoisted(() => vi.fn());

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn().mockResolvedValue('terminal-token'),
}));

vi.mock('socket.io-client', () => ({
  io: ioMock.mockImplementation(() => socketMocks),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function MockFitAddon() {
    return { fit: vi.fn() };
  }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn(function MockSearchAddon() {
    return { findNext: vi.fn() };
  }),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(function MockWebLinksAddon() {
    return {};
  }),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function MockTerminal() {
    return {
      clear: vi.fn(),
      cols: 120,
      dispose: vi.fn(),
      focus: vi.fn(),
      loadAddon: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      open: vi.fn(),
      reset: vi.fn(),
      rows: 32,
      write: vi.fn(),
      writeln: vi.fn(),
    };
  }),
}));

vi.mock('./agent-terminal-availability', () => ({
  isAgentCliTerminalAvailable: () => true,
}));

import {
  AgentCliTerminalBody,
  type AgentCliTerminalController,
  useAgentCliTerminal,
} from '@genfeedai/agent/components/AgentCliTerminal';

type DesktopWindow = Window & { genfeedDesktop?: unknown };

const SESSION: TerminalSessionDto = {
  createdAt: '2026-08-30T08:00:00.000Z',
  cwd: '/workspace',
  id: 'session-rehydrated',
  kind: 'shell',
  threadId: 'thread-active',
};

function TerminalHarness({
  apiService,
  onController,
}: {
  apiService: AgentApiService;
  onController?: (controller: AgentCliTerminalController) => void;
}) {
  const controller = useAgentCliTerminal(apiService);
  onController?.(controller);

  return <AgentCliTerminalBody containerRef={controller.containerRef} />;
}

describe('useAgentCliTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRequestOrganizationId();
    socketMocks.connected = true;
    useAgentChatStore.setState({
      activeTerminalSessionByThread: {},
      activeThreadId: 'thread-active',
      terminalSessionsByThread: new Map(),
    });
  });

  it('sends the routed organization header on the terminal socket handshake', async () => {
    const apiService = {
      getToken: vi.fn().mockResolvedValue('terminal-token'),
    } as unknown as AgentApiService;
    setRequestOrganizationId('org-a');

    render(<TerminalHarness apiService={apiService} />);

    await waitFor(() => {
      expect(ioMock).toHaveBeenCalledOnce();
    });
    expect(ioMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        extraHeaders: {
          Authorization: 'Bearer terminal-token',
          [ORGANIZATION_CONTEXT_HEADER]: 'org-a',
        },
      }),
    );
  });

  it('attaches once when the active thread gains a rehydrated terminal session', async () => {
    const apiService = {
      getToken: vi.fn().mockResolvedValue('terminal-token'),
    } as unknown as AgentApiService;

    render(<TerminalHarness apiService={apiService} />);

    await waitFor(() => {
      expect(ioMock).toHaveBeenCalledOnce();
    });
    socketMocks.emit.mockClear();

    act(() => {
      useAgentChatStore.setState({
        terminalSessionsByThread: new Map([['thread-active', [SESSION]]]),
      });
    });

    await waitFor(() => {
      expect(socketMocks.emit).toHaveBeenCalledWith('terminal:attach', {
        sessionId: SESSION.id,
      });
    });

    await act(async () => {
      useAgentChatStore.setState({
        activeTerminalSessionByThread: {
          'thread-active': SESSION.id,
        },
      });
      await Promise.resolve();
    });

    const attachCalls = socketMocks.emit.mock.calls.filter(
      ([event]) => event === 'terminal:attach',
    );
    expect(attachCalls).toHaveLength(1);
  });

  it('keeps a newly created desktop terminal session alive', async () => {
    const terminalBridge = {
      create: vi.fn().mockResolvedValue({
        command: 'zsh',
        createdAt: '2026-09-25T00:00:00.000Z',
        cwd: '/Users/me',
        id: 'pty-1',
        kind: 'shell',
        pid: 42,
      }),
      kill: vi.fn().mockResolvedValue(undefined),
      onData: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    };
    (window as DesktopWindow).genfeedDesktop = { terminal: terminalBridge };
    const apiService = {
      getToken: vi.fn().mockResolvedValue('terminal-token'),
    } as unknown as AgentApiService;
    let controller: AgentCliTerminalController | null = null;

    try {
      render(
        <TerminalHarness
          apiService={apiService}
          onController={(next) => {
            controller = next;
          }}
        />,
      );

      await waitFor(() => {
        expect(controller?.status).toBe('local terminal ready');
      });

      await act(async () => {
        controller?.startSession('shell');
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(controller?.activeSessionId).toBe('pty-1');
      });
      expect(terminalBridge.kill).not.toHaveBeenCalled();
      expect(
        useAgentChatStore
          .getState()
          .terminalSessionsByThread.get('thread-active')
          ?.map((session) => session.id),
      ).toEqual(['pty-1']);
    } finally {
      delete (window as DesktopWindow).genfeedDesktop;
    }
  });
});
