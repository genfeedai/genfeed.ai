import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAgentOverlayCoordinationState,
  notifyEntityOverlayClosed,
  notifyEntityOverlayOpened,
  requestAgentFromEntityOverlay,
  setCoordinatedAgentPanelOpen,
  subscribeAgentOverlayCoordination,
} from './agent-overlay-coordination.service';

const TEST_OVERLAY_ID = 'coordination-spec-overlay';

describe('agent overlay coordination state', () => {
  afterEach(() => {
    notifyEntityOverlayClosed(TEST_OVERLAY_ID);
    setCoordinatedAgentPanelOpen(false);
    vi.unstubAllGlobals();
  });

  it('tracks an entity inspection lifecycle without browser events or storage', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAgentOverlayCoordination(listener);
    const dispatchEventSpy = vi.fn();
    const storageWriteSpy = vi.fn();
    vi.stubGlobal('window', {
      dispatchEvent: dispatchEventSpy,
      localStorage: { setItem: storageWriteSpy },
    });

    notifyEntityOverlayOpened(TEST_OVERLAY_ID);
    notifyEntityOverlayOpened(TEST_OVERLAY_ID);

    expect(getAgentOverlayCoordinationState().activeEntityOverlayIds).toEqual([
      TEST_OVERLAY_ID,
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(dispatchEventSpy).not.toHaveBeenCalled();
    expect(storageWriteSpy).not.toHaveBeenCalled();

    notifyEntityOverlayClosed(TEST_OVERLAY_ID);
    expect(getAgentOverlayCoordinationState().activeEntityOverlayIds).toEqual(
      [],
    );
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('accepts an agent-open request only from an active inspection overlay', () => {
    const versionBefore =
      getAgentOverlayCoordinationState().agentOpenRequestVersion;

    requestAgentFromEntityOverlay(TEST_OVERLAY_ID);
    expect(getAgentOverlayCoordinationState().agentOpenRequestVersion).toBe(
      versionBefore,
    );

    notifyEntityOverlayOpened(TEST_OVERLAY_ID);
    requestAgentFromEntityOverlay(TEST_OVERLAY_ID);
    expect(getAgentOverlayCoordinationState().agentOpenRequestVersion).toBe(
      versionBefore + 1,
    );
  });

  it('publishes the current agent visibility to entity inspection controls', () => {
    setCoordinatedAgentPanelOpen(true);
    expect(getAgentOverlayCoordinationState().isAgentPanelOpen).toBe(true);

    setCoordinatedAgentPanelOpen(false);
    expect(getAgentOverlayCoordinationState().isAgentPanelOpen).toBe(false);
  });
});
