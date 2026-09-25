import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  type DesktopCliAgentTurnHandleRef,
  runDesktopCliAgentTurn,
} from '@genfeedai/agent/utils/desktop-cli-agent-turn.util';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type {
  DesktopCliAgentEvent,
  IDesktopCliAgentTurnEvent,
  IDesktopCliAgentTurnRequest,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createBridge(options: { threadId?: string } = {}) {
  let listener: ((event: IDesktopCliAgentTurnEvent) => void) | null = null;
  const requests: IDesktopCliAgentTurnRequest[] = [];
  const cancelTurn = vi.fn().mockResolvedValue(undefined);
  const bridge = {
    agentRuntime: {
      cancelTurn,
      onEvent: vi.fn((callback: (event: IDesktopCliAgentTurnEvent) => void) => {
        listener = callback;
        return () => {
          listener = null;
        };
      }),
      startTurn: vi.fn(async (request: IDesktopCliAgentTurnRequest) => {
        requests.push(request);
        return {
          threadId: options.threadId ?? request.threadId ?? 'thread-new',
          turnId: request.turnId,
        };
      }),
    },
  } as unknown as IGenfeedDesktopBridge;

  const emit = (event: DesktopCliAgentEvent, threadId = 'thread-1') => {
    const turnId = requests.at(-1)?.turnId ?? '';
    listener?.({ event, threadId, turnId });
  };

  return { bridge, cancelTurn, emit, requests };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runDesktopCliAgentTurn', () => {
  let activeTurnRef: DesktopCliAgentTurnHandleRef;

  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    activeTurnRef = { current: null };
  });

  it('streams a local CLI turn into the transcript with tool calls', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'thread-1',
      threads: [
        {
          brandId: 'brand-1',
          contextVersion: 1,
          createdAt: '2026-09-25T00:00:00.000Z',
          id: 'thread-1',
          runtimeKey: 'local/claude-cli',
          status: AgentThreadStatus.ACTIVE,
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
      ],
    });
    const { bridge, emit, requests } = createBridge();

    const done = runDesktopCliAgentTurn({
      activeTurnRef,
      bridge,
      content: 'Write a post',
      runtimeKey: 'local/claude-cli',
    });
    await flush();

    expect(requests[0]).toMatchObject({
      brandId: 'brand-1',
      prompt: 'Write a post',
      runtimeKey: 'local/claude-cli',
      threadId: 'thread-1',
    });
    expect(useAgentChatStore.getState().isGenerating).toBe(true);
    expect(useAgentChatStore.getState().activeRunStatus).toBe('running');
    expect(activeTurnRef.current?.turnId).toBe(requests[0]?.turnId);

    emit({
      toolCall: {
        argsSummary: '{"brandId":"brand-1"}',
        id: 't1',
        name: 'get_brand_context',
        status: 'running',
      },
      type: 'tool-call-started',
    });
    emit({ text: 'Hello', type: 'text-delta' });
    emit({ text: ' world', type: 'text-delta' });

    let assistant = useAgentChatStore
      .getState()
      .messages.find((message) => message.role === 'assistant');
    expect(assistant?.content).toBe('Hello world');
    expect(assistant?.metadata?.toolCalls?.[0]).toMatchObject({
      name: 'get_brand_context',
      status: 'running',
    });

    emit({
      isPersisted: true,
      sessionId: 'sess-1',
      text: 'Hello world!',
      toolCalls: [
        {
          argsSummary: '{"brandId":"brand-1"}',
          id: 't1',
          name: 'get_brand_context',
          resultSummary: 'Voice: bold',
          status: 'completed',
        },
      ],
      type: 'completed',
    });
    await done;

    const state = useAgentChatStore.getState();
    assistant = state.messages.find((message) => message.role === 'assistant');
    expect(state.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(assistant?.content).toBe('Hello world!');
    expect(assistant?.metadata?.toolCalls?.[0]).toMatchObject({
      resultSummary: 'Voice: bold',
      status: 'completed',
    });
    expect(state.isGenerating).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.activeRunStatus).toBe('completed');
    expect(state.error).toBeNull();
    expect(activeTurnRef.current).toBeNull();
  });

  it('adopts the thread Desktop created for a new conversation', async () => {
    const { bridge, emit } = createBridge({ threadId: 'thread-created' });

    const done = runDesktopCliAgentTurn({
      activeTurnRef,
      bridge,
      content: 'Plan my week',
      runtimeKey: 'local/codex-cli',
    });
    await flush();

    const state = useAgentChatStore.getState();
    expect(state.activeThreadId).toBe('thread-created');
    expect(
      state.threads.find((thread) => thread.id === 'thread-created'),
    ).toMatchObject({ runtimeKey: 'local/codex-cli', title: 'Plan my week' });
    expect(state.messages[0]?.threadId).toBe('thread-created');

    emit(
      {
        isPersisted: false,
        persistError: 'HTTP 500',
        sessionId: null,
        text: 'Done',
        toolCalls: [],
        type: 'completed',
      },
      'thread-created',
    );
    await done;

    expect(useAgentChatStore.getState().error).toContain(
      'could not be saved to your Genfeed thread: HTTP 500',
    );
  });

  it('surfaces CLI errors and treats cancellation quietly', async () => {
    useAgentChatStore.setState({ activeThreadId: 'thread-1' });
    const first = createBridge();
    const failing = runDesktopCliAgentTurn({
      activeTurnRef,
      bridge: first.bridge,
      content: 'Hi',
      runtimeKey: 'local/claude-cli',
    });
    await flush();
    first.emit({
      code: 'not-authenticated',
      message: 'Claude Code is not signed in. Run `claude auth login`.',
      type: 'error',
    });
    await failing;

    expect(useAgentChatStore.getState().error).toContain('claude auth login');
    expect(useAgentChatStore.getState().isGenerating).toBe(false);

    useAgentChatStore.getState().setError(null);
    const second = createBridge();
    const controller = new AbortController();
    const cancelled = runDesktopCliAgentTurn({
      activeTurnRef,
      bridge: second.bridge,
      content: 'Long task',
      options: { signal: controller.signal },
      runtimeKey: 'local/claude-cli',
    });
    await flush();
    controller.abort();
    expect(second.cancelTurn).toHaveBeenCalledWith(second.requests[0]?.turnId);
    second.emit({ code: 'cancelled', message: 'Stopped.', type: 'error' });
    await cancelled;

    expect(useAgentChatStore.getState().error).toBeNull();
    expect(useAgentChatStore.getState().activeRunStatus).toBe('cancelled');
  });

  it('reports bridge failures without the Electron IPC prefix', async () => {
    const { bridge } = createBridge();
    vi.mocked(bridge.agentRuntime.startTurn).mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'desktop:agentRuntime:startTurn': Error: Sign in to Genfeed in Desktop first.",
      ),
    );

    await runDesktopCliAgentTurn({
      activeTurnRef,
      bridge,
      content: 'Hi',
      runtimeKey: 'local/claude-cli',
    });

    expect(useAgentChatStore.getState().error).toBe(
      'Sign in to Genfeed in Desktop first.',
    );
  });

  it('refuses attachments instead of silently dropping them', async () => {
    const { bridge } = createBridge();

    await runDesktopCliAgentTurn({
      activeTurnRef,
      bridge,
      content: 'Look at this',
      options: {
        attachments: [
          {
            id: 'a1',
            name: 'image.png',
            status: 'completed',
            type: 'image/png',
            url: 'https://cdn.example/a.png',
          } as never,
        ],
      },
      runtimeKey: 'local/claude-cli',
    });

    expect(bridge.agentRuntime.startTurn).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState().error).toContain('Attachments');
  });
});
