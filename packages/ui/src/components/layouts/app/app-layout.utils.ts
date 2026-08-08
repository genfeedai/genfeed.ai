const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'genfeed:sidebar:collapsed';
const SIDEBAR_WIDTH_STORAGE_KEY = 'genfeed:sidebar:width';
const AGENT_PANEL_HEIGHT_STORAGE_KEY = 'genfeed:agent-panel:height';
const AGENT_PANEL_MIN_HEIGHT = 240;
const AGENT_PANEL_MAX_HEIGHT = 720;
/** Left nav rail — matches workspace density; inspector uses 256–480. */
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_DEFAULT_WIDTH = 280;

function getSidebarCollapsedStorageKey(): string {
  if (typeof window === 'undefined') {
    return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:anon`;
  }

  return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:auth`;
}

export function readPersistedSidebarCollapsed(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(getSidebarCollapsedStorageKey());
    if (stored === 'true') {
      return true;
    }
    if (stored === 'false') {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

export function persistSidebarCollapsed(nextValue: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getSidebarCollapsedStorageKey(),
      String(nextValue),
    );
  } catch {
    // Ignore storage write failures (private mode, quota, etc.)
  }
}

export function readPersistedAgentPanelHeight(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(AGENT_PANEL_HEIGHT_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = Number.parseInt(stored, 10);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clampAgentPanelHeight(nextHeight: number): number {
  if (typeof window === 'undefined') {
    return Math.min(
      AGENT_PANEL_MAX_HEIGHT,
      Math.max(AGENT_PANEL_MIN_HEIGHT, nextHeight),
    );
  }

  return Math.min(
    Math.min(AGENT_PANEL_MAX_HEIGHT, Math.floor(window.innerHeight * 0.7)),
    Math.max(AGENT_PANEL_MIN_HEIGHT, nextHeight),
  );
}

export function persistAgentPanelHeight(nextHeight: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      AGENT_PANEL_HEIGHT_STORAGE_KEY,
      String(nextHeight),
    );
  } catch {
    // Ignore storage write failures.
  }
}

export function readPersistedSidebarWidth(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = Number.parseInt(stored, 10);
    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clampSidebarWidth(nextWidth: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(nextWidth)),
  );
}

export function persistSidebarWidth(nextWidth: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(clampSidebarWidth(nextWidth)),
    );
  } catch {
    // Ignore storage write failures.
  }
}
