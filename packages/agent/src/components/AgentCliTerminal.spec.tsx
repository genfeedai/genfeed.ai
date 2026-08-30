import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  type TerminalSessionDto,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
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
  useAgentCliTerminal,
} from '@genfeedai/agent/components/AgentCliTerminal';

const SESSION: TerminalSessionDto = {
  createdAt: '2026-08-30T08:00:00.000Z',
  cwd: '/workspace',
  id: 'session-rehydrated',
  kind: 'shell',
  threadId: 'thread-active',
};

function TerminalHarness({ apiService }: { apiService: AgentApiService }) {
  const controller = useAgentCliTerminal(apiService);

  return <AgentCliTerminalBody containerRef={controller.containerRef} />;
}

describe('useAgentCliTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMocks.connected = true;
    useAgentChatStore.setState({
      activeTerminalSessionByThread: {},
      activeThreadId: 'thread-active',
      terminalSessionsByThread: new Map(),
    });
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
});
