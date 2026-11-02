import { useAgentChatStore } from '@genfeedai/agent';
import type { CreativeAppAgentContext } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreativeAppAgentContext } from './use-creative-app-agent-context';

const mocks = vi.hoisted(() => ({ pathname: '/acme/moonrise/turbo' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

const TURBO_NEW_SCREEN: CreativeAppAgentContext = {
  app: 'turbo',
  projects: [{ id: 'project-1', title: 'Spring launch' }],
};

describe('useCreativeAppAgentContext', () => {
  beforeEach(() => {
    mocks.pathname = '/acme/moonrise/turbo';
    useAgentChatStore.getState().setPageContext(null);
  });

  it('adds the creative app to the page context of the route', () => {
    useAgentChatStore.getState().setPageContext({
      route: '/acme/moonrise/turbo',
      suggestedActions: [],
    });

    renderHook(() => useCreativeAppAgentContext(TURBO_NEW_SCREEN));

    expect(useAgentChatStore.getState().pageContext).toEqual({
      creativeApp: TURBO_NEW_SCREEN,
      route: '/acme/moonrise/turbo',
      suggestedActions: [],
    });
  });

  it('puts the field back when the layout rebuilds the route context', () => {
    renderHook(() => useCreativeAppAgentContext(TURBO_NEW_SCREEN));

    act(() => {
      useAgentChatStore.getState().setPageContext({
        placeholder: 'Ask about this asset...',
        route: '/acme/moonrise/turbo',
        suggestedActions: [],
      });
    });

    expect(useAgentChatStore.getState().pageContext).toMatchObject({
      creativeApp: TURBO_NEW_SCREEN,
      placeholder: 'Ask about this asset...',
    });
  });

  it('leaves with the page and keeps the rest of the context', () => {
    useAgentChatStore.getState().setPageContext({
      placeholder: 'Ask about this asset...',
      route: '/acme/moonrise/turbo',
      suggestedActions: [],
    });
    const { unmount } = renderHook(() =>
      useCreativeAppAgentContext(TURBO_NEW_SCREEN),
    );

    unmount();

    expect(useAgentChatStore.getState().pageContext).toEqual({
      placeholder: 'Ask about this asset...',
      route: '/acme/moonrise/turbo',
      suggestedActions: [],
    });
  });

  it('publishes nothing until the project list is known', () => {
    renderHook(() => useCreativeAppAgentContext(null));

    expect(useAgentChatStore.getState().pageContext).toBeNull();
  });
});
