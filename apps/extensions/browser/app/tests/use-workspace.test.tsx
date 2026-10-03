import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  load: vi.fn().mockResolvedValue(undefined),
  listeners: new Set<(state: unknown) => void>(),
}));
vi.mock('~services/workspace.service', () => ({
  loadWorkspace: mocks.load,
  getWorkspaceState: () => ({ status: 'loading' }),
  subscribeWorkspace: (listener: (state: unknown) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));

import { useWorkspace } from '~hooks/use-workspace';
import { useBrandStore } from '~store/use-brand-store';
import { useChatStore } from '~store/use-chat-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

const ready = {
  status: 'ready',
  snapshot: {
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', slug: 'one' }],
    revision: 1,
  },
} as never;
beforeEach(() => {
  mocks.load.mockClear();
  useWorkspaceStore.setState({ status: 'loading' }, true);
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined as never);
});
afterEach(cleanup);
describe('workspace surface synchronization', () => {
  it('refreshes authoritative identity on mount and focus and removes listeners on cleanup', () => {
    const view = renderHook(useWorkspace);
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRefresh: true,
        signal: expect.any(AbortSignal),
      }),
    );
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    view.unmount();
    window.dispatchEvent(new Event('focus'));
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it('preserves same-scope drafts through refresh but clears them on a brand revision', () => {
    renderHook(useWorkspace);
    act(() => useWorkspaceStore.setState(ready, true));
    useChatStore.setState({ activeThreadId: 'draft' });
    act(() =>
      useWorkspaceStore.setState(
        {
          status: 'refreshing',
          snapshot: (ready as { snapshot: never }).snapshot,
        },
        true,
      ),
    );
    expect(useChatStore.getState().activeThreadId).toBe('draft');
    act(() => useWorkspaceStore.setState(ready, true));
    expect(useChatStore.getState().activeThreadId).toBe('draft');
    act(() =>
      useWorkspaceStore.setState(
        {
          status: 'ready',
          snapshot: {
            ...(ready as { snapshot: object }).snapshot,
            brandId: 'brand-2',
            revision: 2,
          },
        } as never,
        true,
      ),
    );
    expect(useChatStore.getState().activeThreadId).toBeNull();
    expect(useBrandStore.getState().activeBrandId).toBe('brand-2');
  });
});
