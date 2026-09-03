import { useAgentChat } from '@genfeedai/agent/hooks/use-agent-chat';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createCircularIcon(): unknown {
  const icon: Record<string, unknown> = {};
  icon.Provider = icon;
  return icon;
}

describe('useAgentChat', () => {
  beforeEach(() => {
    useAgentChatStore.setState({
      activeThreadId: null,
      error: null,
      isGenerating: false,
      messages: [],
      pageContext: null,
      threads: [],
    });
  });

  it('leaves the model unset so the server resolves the runtime default', async () => {
    const chat = vi.fn().mockResolvedValue({
      contextVersion: 1,
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
    } as unknown as AgentApiService;

    const { result } = renderHook(() =>
      useAgentChat({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Use the default runtime model');
    });

    // No client-side default: the hook sends model: undefined and the
    // server resolves the registry default (agent-runtime-model.constant).
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Use the default runtime model',
        model: undefined,
      }),
      expect.any(AbortSignal),
    );
  });

  it('preserves an explicit model override for internal callers', async () => {
    const chat = vi.fn().mockResolvedValue({
      contextVersion: 1,
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

  it('strips UI-only page context before sending chat payloads', async () => {
    useAgentChatStore.setState({
      pageContext: {
        placeholder: 'Ask me anything...',
        route: '/default/~/agent',
        selectedText: 'selected copy',
        suggestedActions: [
          {
            icon: createCircularIcon() as never,
            label: 'Generate',
            prompt: 'Generate a post',
          },
        ],
      },
    });

    const chat = vi.fn().mockResolvedValue({
      contextVersion: 1,
      creditsRemaining: 95,
      creditsUsed: 5,
      message: {
        content: 'Plain payload response',
        metadata: {},
        role: 'assistant',
      },
      threadId: 'thread-plain-context',
      toolCalls: [],
    });
    const apiService = {
      chat,
    } as unknown as AgentApiService;

    const { result } = renderHook(() =>
      useAgentChat({
        apiService,
      }),
    );

    await act(async () => {
      await result.current.sendMessage('Use current page context');
    });

    const [payload] = chat.mock.calls[0] ?? [];

    expect(payload).toEqual(
      expect.objectContaining({
        pageContext: {
          route: '/default/~/agent',
          selectedText: 'selected copy',
        },
      }),
    );
    expect(payload?.pageContext).not.toHaveProperty('placeholder');
    expect(payload?.pageContext).not.toHaveProperty('suggestedActions');
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('sends selected canonical artifact references with the turn', async () => {
    const chat = vi.fn().mockResolvedValue({
      contextVersion: 1,
      creditsRemaining: 95,
      creditsUsed: 5,
      message: { content: 'Reviewed', metadata: {}, role: 'assistant' },
      threadId: 'thread-reference',
      toolCalls: [],
    });
    const apiService = {
      chat,
    } as unknown as AgentApiService;
    const reference = {
      brandId: 'brand-1',
      kind: 'post' as const,
      organizationId: 'org-1',
      recordId: 'post-1',
      serializer: 'post' as const,
    };
    const { result } = renderHook(() => useAgentChat({ apiService }));

    await act(async () => {
      await result.current.sendMessage('Review this post', {
        artifactReferences: [reference],
      });
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ artifactReferences: [reference] }),
      expect.any(AbortSignal),
    );
  });

  it('writes the send title into the store immediately without a refresh event', async () => {
    const refreshListener = vi.fn();
    window.addEventListener('agent:threads:refresh', refreshListener);

    const chat = vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      contextVersion: 1,
      creditsRemaining: 95,
      creditsUsed: 5,
      message: { content: 'Done', metadata: {}, role: 'assistant' },
      threadId: 'thread-send-title',
      toolCalls: [],
    });
    const apiService = {
      chat,
    } as unknown as AgentApiService;

    const { result } = renderHook(() => useAgentChat({ apiService }));

    await act(async () => {
      await result.current.sendMessage('Visible sidebar title from send');
    });

    expect(useAgentChatStore.getState().threads[0]?.title).toBe(
      'Visible sidebar title from send',
    );
    expect(refreshListener).not.toHaveBeenCalled();

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(refreshListener).not.toHaveBeenCalled();
    vi.useRealTimers();
    window.removeEventListener('agent:threads:refresh', refreshListener);
  });
});
