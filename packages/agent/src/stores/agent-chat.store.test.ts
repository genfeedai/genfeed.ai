import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getItemSpy = vi.fn();
const setItemSpy = vi.fn();

describe('useAgentChatStore overlay coordination', () => {
  beforeEach(() => {
    getItemSpy.mockReset();
    setItemSpy.mockReset();
    getItemSpy.mockReturnValue(null);

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: getItemSpy,
        setItem: setItemSpy,
      },
    });

    useAgentChatStore.setState({
      isOpen: true,
      overlayActiveIds: [],
      overlayAutoCollapsedAgent: false,
      userChangedAgentDuringOverlay: false,
      wasAgentOpenBeforeOverlay: false,
    });
  });

  it('persists explicit open/close preference to localStorage', () => {
    useAgentChatStore.getState().setIsOpen(false);
    expect(setItemSpy).toHaveBeenCalledWith(
      'genfeed-agent-panel-open',
      'false',
    );

    useAgentChatStore.getState().setIsOpen(true);
    expect(setItemSpy).toHaveBeenCalledWith('genfeed-agent-panel-open', 'true');
  });

  it('auto-collapses the agent on the first overlay and restores it on close', () => {
    const state = useAgentChatStore.getState();

    state.beginOverlaySession('ingredient-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(false);
    expect(useAgentChatStore.getState().overlayAutoCollapsedAgent).toBe(true);

    state.endOverlaySession('ingredient-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(true);
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([]);
    expect(useAgentChatStore.getState().overlayAutoCollapsedAgent).toBe(false);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('leaves the agent closed when it was already closed before the overlay', () => {
    useAgentChatStore.setState({ isOpen: false });
    const state = useAgentChatStore.getState();

    state.beginOverlaySession('brand-overlay');
    state.endOverlaySession('brand-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(false);
    expect(useAgentChatStore.getState().wasAgentOpenBeforeOverlay).toBe(false);
  });

  it('does not auto-override a manual reopen during the overlay', () => {
    const state = useAgentChatStore.getState();

    state.beginOverlaySession('ingredient-overlay');
    state.setIsOpen(true);
    state.endOverlaySession('ingredient-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(true);
    expect(useAgentChatStore.getState().userChangedAgentDuringOverlay).toBe(
      false,
    );
  });

  it('waits for all active overlays to close before restoring the agent', () => {
    const state = useAgentChatStore.getState();

    state.beginOverlaySession('ingredient-overlay');
    state.beginOverlaySession('brand-overlay');
    state.endOverlaySession('ingredient-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(false);
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([
      'brand-overlay',
    ]);

    state.endOverlaySession('brand-overlay');

    expect(useAgentChatStore.getState().isOpen).toBe(true);
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([]);
  });
});
