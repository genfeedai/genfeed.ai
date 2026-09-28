import { useDesktopCliAgentChat } from '@genfeedai/agent/hooks/use-desktop-cli-agent-chat';
import { resetDesktopLocalToolsCache } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE } from '@genfeedai/agent/utils/agent-runtime-options.util';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DesktopWindow = Window & { genfeedDesktop?: unknown };

const CODEX_UPGRADE_MESSAGE =
  'This Codex CLI is too old to run Genfeed agent turns. Update it with `npm install -g @openai/codex@latest`, then restart Genfeed Desktop.';

type TestBridge = {
  agentRuntime: {
    cancelTurn: ReturnType<typeof vi.fn>;
    startTurn: ReturnType<typeof vi.fn>;
  };
};

function installBridge(
  tools: { claude: boolean; codex: boolean; isCodexOutdated?: boolean },
  detection?: Promise<unknown>,
) {
  const readiness = {
    anyDetected: tools.claude || tools.codex,
    claude: tools.claude,
    codex: tools.codex,
    detected: [
      ...(tools.claude ? ['claude'] : []),
      ...(tools.codex ? ['codex'] : []),
    ],
    grok: false,
    upgradesRequired: tools.isCodexOutdated
      ? [{ key: 'codex', message: CODEX_UPGRADE_MESSAGE }]
      : [],
  };
  (window as DesktopWindow).genfeedDesktop = {
    agentRuntime: {
      cancelTurn: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn(() => () => undefined),
      startTurn: vi.fn(() => new Promise(() => undefined)),
    },
    app: {
      detectLocalTools: vi.fn(() =>
        detection
          ? detection.then(() => readiness)
          : Promise.resolve(readiness),
      ),
    },
  };
  return (window as DesktopWindow).genfeedDesktop as TestBridge;
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

  it('blocks a CLI thread in a browser instead of sending it to the hosted stream', async () => {
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    // Enabled so every send path (follow-ups, retries) hits the blocker.
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.runtimeKey).toBeNull();
    expect(result.current.blockedReason).toContain('Claude Code');
    expect(result.current.blockedReason).toContain('Genfeed Desktop');
    expect(result.current.blockedReason).toContain('credits');
    expect(result.current.cancelActiveTurn()).toBe(false);

    await act(async () => {
      await result.current.sendMessage('Draft a launch post');
    });
    expect(useAgentChatStore.getState().error).toBe(
      result.current.blockedReason,
    );
    expect(useAgentChatStore.getState().messages).toEqual([]);
  });

  it('blocks a draft bound to a CLI in a browser', () => {
    useAgentChatStore.setState({ draftRuntimeKey: 'local/codex-cli' });

    const { result } = renderHook(() => useDesktopCliAgentChat());

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.blockedReason).toContain('Codex');
  });

  it('keeps hosted threads unblocked in a browser', () => {
    setActiveThread('hosted/genfeed');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.blockedReason).toBeNull();
  });

  it('unblocks a browser thread once it is moved to a hosted runtime', () => {
    setActiveThread('local/claude-cli');
    const { result } = renderHook(() => useDesktopCliAgentChat());
    expect(result.current.blockedReason).not.toBeNull();

    act(() => {
      useAgentChatStore
        .getState()
        .updateThread('thread-1', { runtimeKey: 'hosted/genfeed' });
    });

    expect(result.current.isEnabled).toBe(false);
    expect(result.current.blockedReason).toBeNull();
  });

  it('keeps a thread bound to a missing CLI off the hosted stream and blocks sends', async () => {
    const bridge = installBridge({ claude: false, codex: false });
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await waitFor(() =>
      expect(result.current.blockedReason).toContain(
        'Claude Code was not found on this computer',
      ),
    );
    expect(result.current.isEnabled).toBe(true);

    await act(async () => {
      await result.current.sendMessage('Draft a launch post');
    });
    expect(bridge.agentRuntime.startTurn).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState().error).toContain(
      'Claude Code was not found on this computer',
    );
    expect(useAgentChatStore.getState().messages).toEqual([]);
  });

  it('blocks a Codex thread on an outdated CLI with the upgrade step', async () => {
    const bridge = installBridge({
      claude: true,
      codex: false,
      isCodexOutdated: true,
    });
    setActiveThread('local/codex-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    await waitFor(() =>
      expect(result.current.blockedReason).toContain(CODEX_UPGRADE_MESSAGE),
    );
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.runtimeKey).toBe('local/codex-cli');

    await act(async () => {
      await result.current.sendMessage('Draft a launch post');
    });
    expect(bridge.agentRuntime.startTurn).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState().error).toContain(CODEX_UPGRADE_MESSAGE);
  });

  it('refuses a send while CLI detection is pending instead of dispatching it later', async () => {
    let finishDetection: () => void = () => undefined;
    const detection = new Promise<void>((resolve) => {
      finishDetection = resolve;
    });
    const bridge = installBridge({ claude: true, codex: false }, detection);
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.blockedReason).toBe(
      DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE,
    );

    await act(async () => {
      await result.current.sendMessage('Sent before detection finished');
    });
    expect(useAgentChatStore.getState().error).toBe(
      DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE,
    );
    expect(useAgentChatStore.getState().messages).toEqual([]);

    await act(async () => {
      finishDetection();
      await detection;
    });
    await waitFor(() => expect(result.current.blockedReason).toBeNull());
    expect(bridge.agentRuntime.startTurn).not.toHaveBeenCalled();
  });

  it('never runs a pending-detection send in the thread the user moved to', async () => {
    let finishDetection: () => void = () => undefined;
    const detection = new Promise<void>((resolve) => {
      finishDetection = resolve;
    });
    const bridge = installBridge({ claude: true, codex: false }, detection);
    setActiveThread('local/claude-cli');

    const { result } = renderHook(() => useDesktopCliAgentChat());

    let send: Promise<void> = Promise.resolve();
    act(() => {
      send = result.current.sendMessage('Prompt written in thread A');
    });
    act(() => {
      useAgentChatStore.setState({
        activeThreadId: 'thread-2',
        threads: [
          ...useAgentChatStore.getState().threads,
          {
            brandId: 'brand-b',
            contextVersion: 1,
            createdAt: '2026-09-25T00:00:00.000Z',
            id: 'thread-2',
            runtimeKey: 'local/claude-cli',
            status: AgentThreadStatus.ACTIVE,
            updatedAt: '2026-09-25T00:00:00.000Z',
          },
        ],
      });
    });
    await act(async () => {
      finishDetection();
      await detection;
      await send;
    });

    await waitFor(() => expect(result.current.blockedReason).toBeNull());
    expect(bridge.agentRuntime.startTurn).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState().messages).toEqual([]);
  });

  it('stops the local turn only while its thread is the visible one', async () => {
    installBridge({ claude: true, codex: false });
    setActiveThread('local/claude-cli');
    const bridge = (window as DesktopWindow).genfeedDesktop as {
      agentRuntime: {
        cancelTurn: ReturnType<typeof vi.fn>;
        startTurn: ReturnType<typeof vi.fn>;
      };
    };

    const { result } = renderHook(() => useDesktopCliAgentChat());
    await waitFor(() => expect(result.current.blockedReason).toBeNull());

    act(() => {
      void result.current.sendMessage('Draft a launch post');
    });
    await waitFor(() =>
      expect(bridge.agentRuntime.startTurn).toHaveBeenCalledOnce(),
    );
    const turnRequest = bridge.agentRuntime.startTurn.mock.calls[0]?.[0] as
      | { turnId: string }
      | undefined;
    const turnId = turnRequest?.turnId;
    expect(turnId).toBeTruthy();

    // Thread B is visible with its own hosted run: Stop belongs to that run.
    act(() => {
      useAgentChatStore.getState().setActiveThread('thread-2');
      useAgentChatStore
        .getState()
        .setActiveRun('hosted-run-b', { status: 'running' });
    });
    expect(result.current.cancelActiveTurn()).toBe(false);
    expect(bridge.agentRuntime.cancelTurn).not.toHaveBeenCalled();

    // Back on thread A, Stop cancels the local turn again.
    act(() => {
      useAgentChatStore.getState().setActiveThread('thread-1');
    });
    expect(result.current.cancelActiveTurn()).toBe(true);
    expect(bridge.agentRuntime.cancelTurn).toHaveBeenCalledWith(turnId);
  });
});
