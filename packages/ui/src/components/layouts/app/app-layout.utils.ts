const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'genfeed:sidebar:collapsed';
const SIDEBAR_WIDTH_STORAGE_KEY = 'genfeed:sidebar:width';
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
