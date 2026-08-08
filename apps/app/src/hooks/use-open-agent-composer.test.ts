import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CONVERSATION_TAB_EVENT } from '@/lib/workspace/agent-composer-events';
import { useOpenAgentComposer } from './use-open-agent-composer';

const seedComposer = vi.fn();
const setIsOpen = vi.fn();

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeThreadId: 'thread-1',
      seedComposer,
    }),
}));

vi.mock('@/components/workspace-shell/WorkspaceInspectorContext', () => ({
  useWorkspaceInspector: () => ({
    isOpen: false,
    isRegistered: true,
    registerInspector: () => () => undefined,
    setIsOpen,
    toggle: vi.fn(),
  }),
}));

describe('useOpenAgentComposer', () => {
  beforeEach(() => {
    seedComposer.mockReset();
    setIsOpen.mockReset();
  });

  it('seeds the composer, opens the inspector, and switches to Conversation', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { result } = renderHook(() => useOpenAgentComposer());

    act(() => {
      result.current('Draft a LinkedIn post about our launch.');
    });

    expect(seedComposer).toHaveBeenCalledWith(
      'Draft a LinkedIn post about our launch.',
      'thread-1',
    );
    expect(setIsOpen).toHaveBeenCalledWith(true);
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

    expect(seedComposer).not.toHaveBeenCalled();
    expect(setIsOpen).not.toHaveBeenCalled();
  });
});
