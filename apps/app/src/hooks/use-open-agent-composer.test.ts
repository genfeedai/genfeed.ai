import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CONVERSATION_TAB_EVENT } from '@/lib/workspace/agent-composer-events';
import { useOpenAgentComposer } from './use-open-agent-composer';

interface MockThread {
  brandId?: string | null;
  id: string;
}

const mocks = vi.hoisted(() => ({
  // `undefined` means "fall through to the real context hook" — the
  // no-provider branch has to run through the actual optional chain, not a
  // hand-rolled null.
  inspector: null as
    | { setIsOpen: (isOpen: boolean) => void }
    | null
    | undefined,
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

vi.mock(
  '@/components/workspace-shell/WorkspaceInspectorContext',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/components/workspace-shell/WorkspaceInspectorContext')
      >();

    return {
      ...actual,
      useWorkspaceInspector: () => {
        // Always read the real context so the hook call stays unconditional;
        // the override only decides which value the hook under test sees.
        const contextValue = actual.useWorkspaceInspector();
        return mocks.inspector === undefined ? contextValue : mocks.inspector;
      },
    };
  },
);

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
    mocks.inspector = { setIsOpen: mocks.setIsOpen };
    setStore('thread-1', [{ brandId: 'brand-a', id: 'thread-1' }]);
  });

  it('seeds a fresh conversation, opens the inspector, and switches to Conversation', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a LinkedIn post about our launch.');
    });

    expect(mocks.setActiveThread).toHaveBeenCalledWith(null);
    expect(mocks.resetActiveConversationState).toHaveBeenCalledTimes(1);
    expect(mocks.seedComposer).toHaveBeenCalledWith(
      'Draft a LinkedIn post about our launch.',
      null,
    );
    // The reset clears composerSeed, so it must land before the seed.
    expect(
      mocks.resetActiveConversationState.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.seedComposer.mock.invocationCallOrder[0]);
    expect(mocks.setIsOpen).toHaveBeenCalledWith(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_CONVERSATION_TAB_EVENT }),
    );

    dispatchSpy.mockRestore();
  });

  it('never seeds into the previously active same-brand thread', () => {
    setStore('thread-1', [{ brandId: 'brand-a', id: 'thread-1' }]);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).not.toHaveBeenCalledWith(
      'Draft a post.',
      'thread-1',
    );
    expect(mocks.seedComposer).toHaveBeenCalledWith('Draft a post.', null);
  });

  it('seeds a new conversation when no thread is active', () => {
    setStore(null, []);
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith('Draft a post.', null);
  });

  it('still seeds when no inspector context is mounted', () => {
    mocks.inspector = null;
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith('Draft a post.', null);
    expect(mocks.setIsOpen).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: OPEN_CONVERSATION_TAB_EVENT }),
    );

    dispatchSpy.mockRestore();
  });

  it('runs outside a WorkspaceInspectorProvider', () => {
    // Real context, no provider mounted: `useWorkspaceInspector()` returns
    // null for itself, so the optional chain — not the mock — has to absorb it.
    mocks.inspector = undefined;
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a post.');
    });

    expect(mocks.seedComposer).toHaveBeenCalledWith('Draft a post.', null);
    expect(mocks.setIsOpen).not.toHaveBeenCalled();
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
