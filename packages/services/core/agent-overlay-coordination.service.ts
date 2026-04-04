export const AGENT_PANEL_OPEN_KEY = 'genfeed-agent-panel-open';
export const AGENT_PANEL_STATE_CHANGED_EVENT =
  'genfeed:agent-panel-state-changed';
export const ENTITY_OVERLAY_OPENED_EVENT = 'genfeed:entity-overlay-opened';
export const ENTITY_OVERLAY_CLOSED_EVENT = 'genfeed:entity-overlay-closed';
export const ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT =
  'genfeed:entity-overlay-open-agent-requested';
export const AGENT_PANEL_DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export interface AgentPanelStateChangedDetail {
  isOpen: boolean;
}

export interface EntityOverlayVisibilityDetail {
  overlayId: string;
}

function dispatchWindowEvent<TDetail>(
  eventName: string,
  detail: TDetail,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<TDetail>(eventName, { detail }));
}

export function dispatchAgentPanelStateChanged(isOpen: boolean): void {
  dispatchWindowEvent<AgentPanelStateChangedDetail>(
    AGENT_PANEL_STATE_CHANGED_EVENT,
    { isOpen },
  );
}

export function dispatchEntityOverlayOpened(overlayId: string): void {
  dispatchWindowEvent<EntityOverlayVisibilityDetail>(
    ENTITY_OVERLAY_OPENED_EVENT,
    { overlayId },
  );
}

export function dispatchEntityOverlayClosed(overlayId: string): void {
  dispatchWindowEvent<EntityOverlayVisibilityDetail>(
    ENTITY_OVERLAY_CLOSED_EVENT,
    { overlayId },
  );
}

export function dispatchEntityOverlayOpenAgentRequested(
  overlayId: string,
): void {
  dispatchWindowEvent<EntityOverlayVisibilityDetail>(
    ENTITY_OVERLAY_OPEN_AGENT_REQUESTED_EVENT,
    { overlayId },
  );
}

export function isDesktopAgentViewport(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia(AGENT_PANEL_DESKTOP_MEDIA_QUERY).matches;
}

export function getStoredAgentPanelOpenState(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(AGENT_PANEL_OPEN_KEY);

  if (stored === null) {
    return null;
  }

  return stored === 'true';
}
