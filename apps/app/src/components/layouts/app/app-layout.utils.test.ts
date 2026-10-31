import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clampSidebarWidth,
  persistSidebarWidth,
  readPersistedSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './app-layout.utils';

describe('app-layout.utils sidebar width', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
  });

  afterEach(() => {
    store.clear();
  });

  it('exports a single shared default between min and max', () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(280);
  });

  it('clamps below min and above max', () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 40)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 80)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(300.6)).toBe(301);
  });

  it('persists the clamped width and reads it back', () => {
    persistSidebarWidth(900);
    expect(readPersistedSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH);

    persistSidebarWidth(250);
    expect(readPersistedSidebarWidth()).toBe(250);
  });
});
