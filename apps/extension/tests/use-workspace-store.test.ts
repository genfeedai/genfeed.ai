import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((state: unknown) => void),
}));
vi.mock('~services/workspace.service', () => ({
  getWorkspaceState: () => ({ status: 'loading' }),
  subscribeWorkspace: (listener: (state: unknown) => void) => {
    mocks.listener = listener;
  },
}));

import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

describe('workspace reset boundary', () => {
  it('synchronously clears tenant scoped stores before exposing loading', () => {
    useBrandStore.setState({
      activeBrandId: 'old-brand',
      brandVoice: { voice: 'old voice' },
    });
    useChatStore.setState({
      activeThreadId: 'old-thread',
      messages: [
        {
          id: 'old',
          content: 'old draft',
          role: 'user',
          createdAt: '',
          threadId: 'old-thread',
        },
      ],
    });
    mocks.listener?.({ status: 'loading' });
    expect(useWorkspaceStore.getState().status).toBe('loading');
    expect(useBrandStore.getState().activeBrandId).toBeNull();
    expect(useBrandStore.getState().brandVoice).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().activeThreadId).toBeNull();
  });
  it('retains draft stores while same-scope authorization is refreshing or temporarily blocked', () => {
    useChatStore.setState({ activeThreadId: 'draft-thread' });
    mocks.listener?.({ status: 'refreshing', snapshot: { revision: 1 } });
    expect(useChatStore.getState().activeThreadId).toBe('draft-thread');
    mocks.listener?.({ status: 'blocked', error: 'HTTP 503' });
    expect(useChatStore.getState().activeThreadId).toBe('draft-thread');
  });
});
