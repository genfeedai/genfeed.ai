import { DEFAULT_RUNTIME_AGENT_MODEL } from '@cloud/agent/constants/agent-runtime-model.constant';
import { useAgentChat } from '@cloud/agent/hooks/use-agent-chat';
import type { AgentApiService } from '@cloud/agent/services/agent-api.service';
import { useAgentChatStore } from '@cloud/agent/stores/agent-chat.store';
import { act, renderHook } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAgentChat', () => {
  beforeEach(() => {
    useAgentChatStore.setState({
      activeThreadId: null,
      error: null,
      isGenerating: false,
      messages: [],
      threads: [],
    });
  });

  it('uses the runtime default model when no explicit model is supplied', async () => {
    const chat = vi.fn().mockResolvedValue({
      creditsRemaining: 95,
      creditsUsed: 5,
      message: {
        content: 'Kimi default response',
        metadata: {},
        role: 'assistant',
      },
      threadId: 'thread-kimi-default',
      toolCalls: [],
    });
    const apiService = {
      chat,
      chatEffect: vi.fn((...args: Parameters<typeof chat>) =>
        Effect.promise(() => chat(...args)),
      ),
    } as unknown as AgentApiService;

    const { result } = renderHook(() =>
      useAgentChat({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Use the default runtime model');
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Use the default runtime model',
        model: DEFAULT_RUNTIME_AGENT_MODEL,
      }),
      expect.any(AbortSignal),
    );
  });

  it('preserves an explicit model override for internal callers', async () => {
    const chat = vi.fn().mockResolvedValue({
      creditsRemaining: 95,
      creditsUsed: 5,
      message: {
        content: 'Explicit override response',
        metadata: {},
        role: 'assistant',
      },
      threadId: 'thread-override',
      toolCalls: [],
    });
    const apiService = {
      chat,
      chatEffect: vi.fn((...args: Parameters<typeof chat>) =>
        Effect.promise(() => chat(...args)),
      ),
    } as unknown as AgentApiService;

    const { result } = renderHook(() =>
      useAgentChat({
        apiService,
        model: 'openai/gpt-5.4',
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Use the explicit runtime model');
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Use the explicit runtime model',
        model: 'openai/gpt-5.4',
      }),
      expect.any(AbortSignal),
    );
  });
});
