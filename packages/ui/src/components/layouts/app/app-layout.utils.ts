const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'genfeed:sidebar:collapsed';
const AGENT_PANEL_HEIGHT_STORAGE_KEY = 'genfeed:agent-panel:height';
const AGENT_PANEL_MIN_HEIGHT = 240;
const AGENT_PANEL_MAX_HEIGHT = 720;

function getSidebarCollapsedStorageKey(): string {
  if (typeof window === 'undefined') {
    return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:anon`;
  }

  const clerk = window.Clerk as { user?: { id?: string } } | undefined;
  const userId = clerk?.user?.id ?? 'anon';
  return `${SIDEBAR_COLLAPSED_STORAGE_PREFIX}:${userId}`;
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
