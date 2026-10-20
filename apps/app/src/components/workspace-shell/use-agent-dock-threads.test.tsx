import {
  type AgentApiService,
  type AgentThread,
  useAgentChatStore,
} from '@genfeedai/agent';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_CHAT_TAB_ID, useAgentDockThreads } from './use-agent-dock-threads';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function makeThread(id: string, title: string): AgentThread {
  return { id, title } as AgentThread;
}

const apiService = {
  getMessages: vi.fn().mockResolvedValue([]),
} as unknown as AgentApiService;

function renderThreads() {
  return renderHook(() => useAgentDockThreads(apiService, false));
}

describe('useAgentDockThreads chat tabs', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    const { setThreads } = useAgentChatStore.getState();
    setThreads([
      makeThread('thread-1', 'Spring launch plan'),
      makeThread('thread-2', 'Caption ideas'),
    ]);
  });

  it('starts with the unsaved chat as its only tab', () => {
    const { result } = renderThreads();

    expect(result.current.chatTabs).toEqual([
      { id: NEW_CHAT_TAB_ID, title: 'New chat' },
    ]);
  });

  it('opens a tab for each chat that comes to the front, in the order opened', async () => {
    const { result } = renderThreads();

    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    await act(async () => {
      await result.current.selectThread('thread-2');
    });

    expect(result.current.chatTabs).toEqual([
      { id: 'thread-1', title: 'Spring launch plan' },
      { id: 'thread-2', title: 'Caption ideas' },
    ]);
  });

  it('adds the unsaved chat back after the open ones when a new thread starts', async () => {
    const { result } = renderThreads();
    await act(async () => {
      await result.current.selectThread('thread-1');
    });

    act(() => result.current.startThread());

    expect(result.current.chatTabs.map((tab) => tab.id)).toEqual([
      'thread-1',
      NEW_CHAT_TAB_ID,
    ]);
  });

  it('moves to the neighbouring chat when the front one is closed', async () => {
    const { result } = renderThreads();
    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    await act(async () => {
      await result.current.selectThread('thread-2');
    });

    await act(async () => {
      result.current.closeChatTab('thread-2');
    });

    expect(result.current.activeThreadId).toBe('thread-1');
    expect(result.current.chatTabs.map((tab) => tab.id)).toEqual(['thread-1']);
  });

  it('falls back to an unsaved chat when the last chat is closed', async () => {
    const { result } = renderThreads();
    await act(async () => {
      await result.current.selectThread('thread-1');
    });

    act(() => result.current.closeChatTab('thread-1'));

    expect(result.current.activeThreadId).toBeNull();
    expect(result.current.chatTabs.map((tab) => tab.id)).toEqual([
      NEW_CHAT_TAB_ID,
    ]);
  });

  it('keeps the front chat when a background tab is closed', async () => {
    const { result } = renderThreads();
    await act(async () => {
      await result.current.selectThread('thread-1');
    });
    await act(async () => {
      await result.current.selectThread('thread-2');
    });

    act(() => result.current.closeChatTab('thread-1'));

    expect(result.current.activeThreadId).toBe('thread-2');
    expect(result.current.chatTabs.map((tab) => tab.id)).toEqual(['thread-2']);
  });
});
