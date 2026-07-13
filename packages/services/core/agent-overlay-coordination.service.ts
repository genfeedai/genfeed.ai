export const AGENT_PANEL_OPEN_KEY = 'genfeed-agent-panel-open';
export const AGENT_PANEL_DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export interface AgentOverlayCoordinationState {
  readonly activeEntityOverlayIds: readonly string[];
  readonly agentOpenRequestVersion: number;
  readonly isAgentPanelOpen: boolean;
}

type AgentOverlayCoordinationListener = () => void;

const listeners = new Set<AgentOverlayCoordinationListener>();

const SERVER_STATE: AgentOverlayCoordinationState = Object.freeze({
  activeEntityOverlayIds: Object.freeze([]),
  agentOpenRequestVersion: 0,
  isAgentPanelOpen: false,
});

let state: AgentOverlayCoordinationState = SERVER_STATE;

function publishState(nextState: AgentOverlayCoordinationState): void {
  if (nextState === state) {
    return;
  }

  state = Object.freeze({
    ...nextState,
    activeEntityOverlayIds: Object.freeze([
      ...nextState.activeEntityOverlayIds,
    ]),
  });
  for (const listener of listeners) {
    listener();
  }
}

export function getAgentOverlayCoordinationState(): AgentOverlayCoordinationState {
  return state;
}

export function getServerAgentOverlayCoordinationState(): AgentOverlayCoordinationState {
  return SERVER_STATE;
}

export function subscribeAgentOverlayCoordination(
  listener: AgentOverlayCoordinationListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyEntityOverlayOpened(overlayId: string): void {
  if (!overlayId || state.activeEntityOverlayIds.includes(overlayId)) {
    return;
  }

  publishState({
    ...state,
    activeEntityOverlayIds: [...state.activeEntityOverlayIds, overlayId],
  });
}

export function notifyEntityOverlayClosed(overlayId: string): void {
  if (!state.activeEntityOverlayIds.includes(overlayId)) {
    return;
  }

  publishState({
    ...state,
    activeEntityOverlayIds: state.activeEntityOverlayIds.filter(
      (activeOverlayId) => activeOverlayId !== overlayId,
    ),
  });
}

export function requestAgentFromEntityOverlay(overlayId: string): void {
  if (!overlayId || !state.activeEntityOverlayIds.includes(overlayId)) {
    return;
  }

  publishState({
    ...state,
    agentOpenRequestVersion: state.agentOpenRequestVersion + 1,
  });
}

export function setCoordinatedAgentPanelOpen(isOpen: boolean): void {
  if (state.isAgentPanelOpen === isOpen) {
    return;
  }

  publishState({ ...state, isAgentPanelOpen: isOpen });
}

export function subscribeDesktopAgentViewport(
  listener: () => void,
): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(AGENT_PANEL_DESKTOP_MEDIA_QUERY);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
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
