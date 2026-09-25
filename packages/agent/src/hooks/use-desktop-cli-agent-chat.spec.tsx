import { useDesktopCliAgentChat } from '@genfeedai/agent/hooks/use-desktop-cli-agent-chat';
import { resetDesktopLocalToolsCache } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DesktopWindow = Window & { genfeedDesktop?: unknown };

function installBridge(tools: { claude: boolean; codex: boolean }) {
  (window as DesktopWindow).genfeedDesktop = {
    agentRuntime: {
      cancelTurn: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => () => undefined),
      startTurn: vi.fn(),
    },
    app: {
      detectLocalTools: vi.fn().mockResolvedValue({
        anyDetected: tools.claude || tools.codex,
        claude: tools.claude,
        codex: tools.codex,
        detected: [
          ...(tools.claude ? ['claude'] : []),
          ...(tools.codex ? ['codex'] : []),
        ],
        grok: false,
      }),
    },
  };
}

function setActiveThread(runtimeKey?: string) {
  useAgentChatStore.setState({
    activeThreadId: 'thread-1',
    threads: [
      {
        contextVersion: 1,
        createdAt: '2026-09-25T00:00:00.000Z',
        id: 'thread-1',
        ...(runtimeKey ? { runtimeKey } : {}),
        status: AgentThreadStatus.ACTIVE,
        updatedAt: '2026-09-25T00:00:00.000Z',
      },
    ],
  });
}

describe('useDesktopCliAgentChat transport selection', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    resetDesktopLocalToolsCache();
  });

  afterEach(() => {
    delete (window as DesktopWindow).genfeedDesktop;
    resetDesktopLocalToolsCache();
  });

  it('uses the desktop CLI transport for a local runtime thread in Desktop', async () => {
    installBridge({ claude: true, codex: false });
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await waitFor(() => expect(result.current.isEnabled).toBe(true));
    expect(result.current.runtimeKey).toBe('local/claude-cli');
  });

  it('uses the draft runtime before the thread exists', async () => {
    installBridge({ claude: false, codex: true });
    useAgentChatStore.setState({ draftRuntimeKey: 'local/codex-cli' });

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await waitFor(() =>
      expect(result.current.runtimeKey).toBe('local/codex-cli'),
    );
  });

  it('keeps hosted threads on the API stream', async () => {
    installBridge({ claude: true, codex: true });
    setActiveThread('hosted/genfeed');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.isEnabled).toBe(false);
  });

  it('stays on the API stream in a browser even for a CLI thread', () => {
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.cancelActiveTurn()).toBe(false);
  });

  it('stays on the API stream when the CLI is not installed', async () => {
    installBridge({ claude: false, codex: false });
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.isEnabled).toBe(false);
  });
});
