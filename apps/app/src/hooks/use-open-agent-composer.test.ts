import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CONVERSATION_TAB_EVENT } from '@/lib/workspace/agent-composer-events';
import { useOpenAgentComposer } from './use-open-agent-composer';

interface MockThread {
  brandId?: string | null;
  id: string;
}

const mocks = vi.hoisted(() => ({
  brandId: 'brand-a',
  inspector: null as { setIsOpen: (isOpen: boolean) => void } | null,
  resetActiveConversationState: vi.fn(),
  seedComposer: vi.fn(),
  setActiveThread: vi.fn(),
  setIsOpen: vi.fn(),
  state: {
    activeThreadId: 'thread-1' as string | null,
    threads: [] as MockThread[],
  },
}));

vi.mock('@genfeedai/agent', () => {
  const getState = () => ({
    activeThreadId: mocks.state.activeThreadId,
    resetActiveConversationState: mocks.resetActiveConversationState,
    seedComposer: mocks.seedComposer,
    setActiveThread: mocks.setActiveThread,
    threads: mocks.state.threads,
  });

  return {
    useAgentChatStore: Object.assign(
      (selector: (state: ReturnType<typeof getState>) => unknown) =>
        selector(getState()),
      { getState },
    ),
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    organizationId: 'org-1',
  }),
}));

vi.mock('@/components/workspace-shell/WorkspaceInspectorContext', () => ({
  useWorkspaceInspector: () => mocks.inspector,
}));

function setStore(activeThreadId: string | null, threads: MockThread[]): void {
  mocks.state.activeThreadId = activeThreadId;
  mocks.state.threads = threads;
}

describe('useOpenAgentComposer', () => {
  beforeEach(() => {
    mocks.resetActiveConversationState.mockReset();
    mocks.seedComposer.mockReset();
    mocks.setActiveThread.mockReset();
    mocks.setIsOpen.mockReset();
    mocks.brandId = 'brand-a';
    mocks.inspector = { setIsOpen: mocks.setIsOpen };
    setStore('thread-1', [{ brandId: 'brand-a', id: 'thread-1' }]);
  });

  it('seeds the composer, opens the inspector, and switches to Conversation', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a LinkedIn post about our launch.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a LinkedIn post about our launch.',
      'thread-1',
    );
    expect(mocks.setIsOpen).toHaveBeenCalledWith(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_CONVERSATION_TAB_EVENT }),
    );

    dispatchSpy.mockRestore();
  });

  it('keeps the active thread when it carries no brand yet', () => {
    setStore('thread-1', [{ brandId: null, id: 'thread-1' }]);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a post.',
      'thread-1',
    );
    expect(mocks.setActiveThread).not.toHaveBeenCalled();
  });

  it('keeps the active thread when the workspace has no brand selected', () => {
    mocks.brandId = '';
    setStore('thread-1', [{ brandId: 'brand-b', id: 'thread-1' }]);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a post.',
      'thread-1',
    );
    expect(mocks.setActiveThread).not.toHaveBeenCalled();
  });

  it('starts a fresh thread when the active thread belongs to another brand', () => {
    setStore('thread-1', [{ brandId: 'brand-b', id: 'thread-1' }]);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post for brand A.');
    });

    expect(mocks.setActiveThread).toHaveBeenCalledWith(null);
    expect(mocks.resetActiveConversationState).toHaveBeenCalledTimes(1);
    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a post for brand A.',
      null,
    );
    // The reset clears composerSeed, so it must land before the seed.
    expect(
      mocks.resetActiveConversationState.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.seedComposer.mock.invocationCallOrder[0]);
  });

  it('seeds a new conversation when no thread is active', () => {
    setStore(null, []);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith('Draft a post.', null);
    expect(mocks.setActiveThread).not.toHaveBeenCalled();
  });

  it('still seeds when no inspector context is mounted', () => {
    mocks.inspector = null;
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a post.',
      'thread-1',
    );
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_CONVERSATION_TAB_EVENT }),
    );

    dispatchSpy.mockRestore();
  });

  it('ignores empty prompts', () => {
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('   ');
    });

    expect(mocks.seedComposer).not.toHaveBeenCalled();
    expect(mocks.setIsOpen).not.toHaveBeenCalled();
  });
});
