import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getIsInspectorDocked,
  INSPECTOR_DOCKED_MEDIA_QUERY,
  subscribeInspectorDocked,
} from './inspector-viewport.util';

function mockMatchMedia(matches: boolean) {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        addEventListener,
        matches,
        media: query,
        removeEventListener,
      }) as unknown as MediaQueryList,
  );

  return { addEventListener, matchMedia, removeEventListener };
}

describe('getIsInspectorDocked', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('docks the inspector when the viewport matches', () => {
    mockMatchMedia(true);

    expect(getIsInspectorDocked()).toBe(true);
  });

  it('falls back to the sheet when the viewport is narrower', () => {
    mockMatchMedia(false);

    expect(getIsInspectorDocked()).toBe(false);
  });

  it('queries the lg breakpoint', () => {
    const { matchMedia } = mockMatchMedia(true);

    getIsInspectorDocked();

    expect(matchMedia).toHaveBeenCalledWith(INSPECTOR_DOCKED_MEDIA_QUERY);
  });
});

describe('subscribeInspectorDocked', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers and removes a change listener', () => {
    const { addEventListener, removeEventListener } = mockMatchMedia(true);
    const listener = vi.fn();

    const unsubscribe = subscribeInspectorDocked(listener);

    expect(addEventListener).toHaveBeenCalledWith('change', listener);

    unsubscribe();

    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
