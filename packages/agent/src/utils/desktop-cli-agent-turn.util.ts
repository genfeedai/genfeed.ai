import type { SendStreamMessageOptions } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type {
  AgentChatMessage,
  AgentToolCall,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { syncAgentThreadFromTurn } from '@genfeedai/agent/utils/sync-agent-thread-from-turn';
import type { AgentExternalRuntimeKey } from '@genfeedai/contracts/constants';
import type {
  DesktopCliAgentEvent,
  IDesktopCliAgentToolCall,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';

export const DESKTOP_CLI_RUN_ID_PREFIX = 'desktop-cli:';

const ELECTRON_INVOKE_ERROR_PREFIX =
  /^Error invoking remote method '[^']+': (?:[A-Za-z]*Error: )?/;

export interface DesktopCliAgentTurnHandleRef {
  current: { bridge: IGenfeedDesktopBridge; turnId: string } | null;
}

function createTurnId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function readErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'The local agent could not start.';
  return message.replace(ELECTRON_INVOKE_ERROR_PREFIX, '');
}

/** Renders a CLI tool call with the same shape hosted turns use. */
export function toAgentToolCall(
  toolCall: IDesktopCliAgentToolCall,
): AgentToolCall {
  return {
    arguments: toolCall.argsSummary ? { summary: toolCall.argsSummary } : {},
    ...(toolCall.argsSummary ? { detail: toolCall.argsSummary } : {}),
    ...(toolCall.error ? { error: toolCall.error } : {}),
    id: toolCall.id,
    name: toolCall.name,
    ...(toolCall.resultSummary
      ? { resultSummary: toolCall.resultSummary }
      : {}),
    status: toolCall.status,
  };
}

/**
 * Runs one agent turn on the user's local Claude Code / Codex CLI through the
 * Genfeed Desktop bridge and projects the normalized events into the chat
 * store, so the standard message and tool-call UI renders them. Desktop main
 * saves the finished turn to the Genfeed thread (never billed in credits).
 */
export function runDesktopCliAgentTurn(params: {
  activeTurnRef: DesktopCliAgentTurnHandleRef;
  bridge: IGenfeedDesktopBridge;
  content: string;
  options?: SendStreamMessageOptions;
  runtimeKey: AgentExternalRuntimeKey;
}): Promise<void> {
  const { activeTurnRef, bridge, content, options, runtimeKey } = params;
  const store = useAgentChatStore;

  if (options?.signal?.aborted) {
    return Promise.resolve();
  }

  if (options?.attachments?.length || options?.artifactReferences?.length) {
    store
      .getState()
      .setError(
        'Attachments are not sent to local CLI runtimes yet. Switch the runtime to Genfeed to include them.',
      );
    return Promise.resolve();
  }

  if (options?.forceNewThread) {
    store.getState().setActiveThread(null);
    store.getState().resetActiveConversationState();
  }

  const initialState = store.getState();
  const threadId = initialState.activeThreadId;
  const thread = initialState.threads.find((item) => item.id === threadId);
  const brandId = options?.brandId ?? thread?.brandId ?? null;
  const turnId = createTurnId();
  const runId = `${DESKTOP_CLI_RUN_ID_PREFIX}${turnId}`;
  const startedAt = new Date().toISOString();
  const userMessageId = `user-${turnId}`;
  const assistantMessageId = `desktop-cli-${turnId}`;
  let visibleThreadId: string | null = threadId;
  let text = '';
  let model: string | undefined;
  const toolCalls = new Map<string, AgentToolCall>();

  initialState.addMessage({
    content,
    createdAt: startedAt,
    id: userMessageId,
    role: 'user',
    threadId: threadId ?? '',
  });
  initialState.setError(null);
  initialState.setIsGenerating(true);
  initialState.setActiveRun(runId, { startedAt, status: 'running' });
  activeTurnRef.current = { bridge, turnId };

  const isVisible = () => store.getState().activeThreadId === visibleThreadId;

  const renderAssistant = () => {
    if (!isVisible() || (!text && toolCalls.size === 0)) {
      return;
    }

    const message: AgentChatMessage = {
      content: text,
      createdAt: startedAt,
      id: assistantMessageId,
      metadata: {
        ...(model ? { model } : {}),
        toolCalls: [...toolCalls.values()],
      },
      role: 'assistant',
      threadId: visibleThreadId ?? '',
    };

    // Only the transcript changes; pagination state stays intact.
    store.setState((state) => {
      const index = state.messages.findIndex(
        (item) => item.id === assistantMessageId,
      );
      return {
        messages:
          index === -1
            ? [...state.messages, message]
            : state.messages.map((item, itemIndex) =>
                itemIndex === index ? message : item,
              ),
      };
    });
  };

  return new Promise<void>((resolve) => {
    let isSettled = false;

    const settle = (status: 'cancelled' | 'completed' | 'failed') => {
      if (isSettled) {
        return;
      }
      isSettled = true;
      unsubscribe();
      options?.signal?.removeEventListener('abort', handleAbort);
      if (activeTurnRef.current?.turnId === turnId) {
        activeTurnRef.current = null;
      }

      const state = store.getState();
      if (state.activeRunId === runId) {
        state.setActiveRun(null, { startedAt: null, status });
      }
      state.setIsGenerating(false);
      resolve();
    };

    const handleEvent = (event: DesktopCliAgentEvent) => {
      switch (event.type) {
        case 'session':
          model = event.model ?? model;
          return;
        case 'text-delta':
          text += event.text;
          renderAssistant();
          return;
        case 'tool-call-started':
        case 'tool-call-finished':
          toolCalls.set(event.toolCall.id, toAgentToolCall(event.toolCall));
          renderAssistant();
          return;
        case 'completed': {
          text = event.text || text;
          for (const toolCall of event.toolCalls) {
            toolCalls.set(toolCall.id, toAgentToolCall(toolCall));
          }
          renderAssistant();
          if (visibleThreadId) {
            store.getState().updateThread(visibleThreadId, {
              lastActivityAt: new Date().toISOString(),
              lastAssistantPreview: text.slice(0, 280),
              runtimeKey,
            });
          }
          settle('completed');
          if (!event.isPersisted) {
            store
              .getState()
              .setError(
                `The reply is shown here but could not be saved to your Genfeed thread${event.persistError ? `: ${event.persistError}` : '.'}`,
              );
          }
          return;
        }
        case 'error':
          settle(event.code === 'cancelled' ? 'cancelled' : 'failed');
          if (event.code !== 'cancelled') {
            store.getState().setError(event.message);
          }
          return;
        default:
          return;
      }
    };

    const unsubscribe = bridge.agentRuntime.onEvent((payload) => {
      if (payload.turnId === turnId) {
        handleEvent(payload.event);
      }
    });

    const handleAbort = () => {
      void bridge.agentRuntime.cancelTurn(turnId).catch(() => undefined);
    };
    options?.signal?.addEventListener('abort', handleAbort, { once: true });

    bridge.agentRuntime
      .startTurn({
        brandId,
        prompt: content,
        runtimeKey,
        threadId,
        turnId,
      })
      .then((handle) => {
        if (threadId || isSettled) {
          return;
        }

        // A new thread was created in Genfeed for this runtime.
        const state = store.getState();
        visibleThreadId = handle.threadId;
        if (state.activeThreadId !== null) {
          return;
        }

        syncAgentThreadFromTurn({
          activeThreadId: null,
          brandId,
          createdAt: startedAt,
          setActiveThread: state.setActiveThread,
          threadId: handle.threadId,
          title: content.slice(0, 60),
          upsertThread: state.upsertThread,
        });
        store.getState().updateThread(handle.threadId, { runtimeKey });
        store.setState((current) => ({
          messages: current.messages.map((message) =>
            message.id === userMessageId || message.id === assistantMessageId
              ? { ...message, threadId: handle.threadId }
              : message,
          ),
        }));
      })
      .catch((error: unknown) => {
        settle('failed');
        store.getState().setError(readErrorMessage(error));
      });
  });
}
